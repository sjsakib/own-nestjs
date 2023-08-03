import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import 'reflect-metadata';

/*
 * keys, constants, types
 */
const HTTP_METHOD_KEY = Symbol('method');
const PATH_KEY = Symbol('path');
const PARAMS_META_KEY = Symbol('paramsMeta');
const PROVIDERS_KEY = Symbol('providers');
const CONTROLLERS_KEY = Symbol('controllers');
const CONTROLLER_PREFIX_KEY = Symbol('controllerPrefix');
const DESIGN_PARAM_TYPES = 'design:paramtypes';

enum HandlerParamType {
  ROUTE_PARAM = 'ROUTE_PARAM',
  BODY = 'BODY',
}

enum HttpMethod {
  GET = 'get',
  POST = 'post',
}

type ClassType = new (...args: unknown[]) => unknown;

/*
 * decorators to be used in program code
 */
export function Controller(prefix?: string) {
  return function (target: ClassType) {
    Reflect.defineMetadata(CONTROLLER_PREFIX_KEY, prefix ?? '', target);
  };
}

function getRouteDecorator(httpMethod: HttpMethod, path: string) {
  return function (target: any, key: string) {
    Reflect.defineMetadata(HTTP_METHOD_KEY, httpMethod, target, key);
    Reflect.defineMetadata(PATH_KEY, path, target, key);
  };
}

export function Get(path: string) {
  return getRouteDecorator(HttpMethod.GET, path);
}

export function Post(path: string) {
  return getRouteDecorator(HttpMethod.POST, path);
}

function getHandlerParamDecorator(type: HandlerParamType, key: string) {
  return function (target: any, methodName: string, index: number) {
    const paramsMeta = Reflect.getMetadata(PARAMS_META_KEY, target, methodName) ?? {};
    paramsMeta[index] = { key, type };
    Reflect.defineMetadata(PARAMS_META_KEY, paramsMeta, target, methodName);
  };
}

export function Param(key?: string) {
  return getHandlerParamDecorator(HandlerParamType.ROUTE_PARAM, key);
}

export function Body(key?: string) {
  return getHandlerParamDecorator(HandlerParamType.BODY, key);
}

export function Module({
  providers,
  controllers,
}: {
  providers: ClassType[];
  controllers: ClassType[];
}) {
  return function (target: ClassType) {
    Reflect.defineMetadata(PROVIDERS_KEY, providers, target);
    Reflect.defineMetadata(CONTROLLERS_KEY, controllers, target);
  };
}

export function Injectable() {
  return function (_: ClassType) {};
}

/*
 * framework code that uses the metadata injected by the decorators
 * to create an express app
 */
export function createApp(module: ClassType) {
  const app = express();
  app.use(bodyParser.json());

  // cache to store the instances of providers
  const providerInstances = new Map();

  function instantiateProvider(Cls: ClassType) {
    if (providerInstances.has(Cls)) return providerInstances.get(Cls);

    // get all the dependencies of the provider, and instantiate those first
    // not handling circular dependencies
    const deps = Reflect.getMetadata(DESIGN_PARAM_TYPES, Cls) ?? [];
    const params = deps.map(instantiateProvider);

    const instance = new Cls(...params);

    // cache it to be used when it is required next time
    providerInstances.set(Cls, instance);

    return instance;
  }

  // Let's instantiate all the providers first with their dependencies
  // and keep them in the cache
  Reflect.getMetadata(PROVIDERS_KEY, module).forEach(instantiateProvider);

  // process the controllers now
  Reflect.getMetadata(CONTROLLERS_KEY, module).forEach((ControllerCls: ClassType) => {
    // instantiate the controller with all their dependencies
    const params = Reflect.getMetadata(DESIGN_PARAM_TYPES, ControllerCls).map(
      (ProviderCls: ClassType) => {
        if (!providerInstances.has(ProviderCls))
          throw new Error(
            `You forgot to add ${ProviderCls.name} to the providers array of the module`
          );
        return providerInstances.get(ProviderCls);
      }
    );
    const controller = new ControllerCls(...params);

    let prefix = Reflect.getMetadata(CONTROLLER_PREFIX_KEY, ControllerCls);
    if (prefix && !prefix.startsWith('/')) prefix = `/${prefix}`;

    // process each of the route handlers
    Reflect.ownKeys(ControllerCls.prototype)
      .filter((property: string) => {
        return Reflect.hasOwnMetadata(HTTP_METHOD_KEY, ControllerCls.prototype, property);
      })
      .forEach((method: string) => {
        // metadata of each parameter is stored in a object against the index of where it appears
        // and the whole object is stored in the method's metadata against the PARAMS_META_KEY key
        // let's get the whole object and keep them to be used when when we go through each parameter
        const paramsMeta =
          Reflect.getMetadata(PARAMS_META_KEY, ControllerCls.prototype, method) ?? {};

        const httpMethod = Reflect.getMetadata(HTTP_METHOD_KEY, controller, method);

        const path = Reflect.getMetadata(PATH_KEY, controller, method);
        const fullPath = `${prefix}${path}`;

        app[httpMethod](fullPath, async (req: Request, res: Response) => {
          const params = Reflect.getMetadata(
            // get all the params first
            DESIGN_PARAM_TYPES,
            ControllerCls.prototype,
            method
          ).map((_: any, index: number) => {
            // and then map them to the actual data to be passed
            const paramMeta = paramsMeta[index];

            if (!paramMeta) return undefined;

            const dataToPass = {
              [HandlerParamType.BODY]: req.body,
              [HandlerParamType.ROUTE_PARAM]: req.params,
            }[paramMeta.type];

            console.log({ httpMethod, dataToPass, paramMeta, body: req.body });

            if (paramMeta.key) return dataToPass[paramMeta.key];
            return dataToPass;
          });
          res.send(await controller[method](...params));
        });
      });
  });
  return app;
}
