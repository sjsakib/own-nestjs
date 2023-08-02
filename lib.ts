import express from 'express';
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
  PATH_PARAM = 'PATH_PARAM',
}

enum HttpMethod {
  GET = 'get',
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

export function Get(path: string) {
  return function (target: any, key: string) {
    Reflect.defineMetadata(HTTP_METHOD_KEY, HttpMethod.GET, target, key);
    Reflect.defineMetadata(PATH_KEY, path, target, key);
  };
}

export function Param(key: string) {
  return function (target: any, methodName: string, index: number) {
    const paramsMeta = Reflect.getMetadata(PARAMS_META_KEY, target, methodName) ?? {};
    paramsMeta[index] = { key, type: HandlerParamType.PATH_PARAM };
    Reflect.defineMetadata(PARAMS_META_KEY, paramsMeta, target, methodName);
  };
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
  return function (target: ClassType) {};
}


/*
 * framework code that uses the metadata injected by the decorators
 * to create an express app
 */
export function createApp(module: ClassType) {
  const app = express();

  const allProviders = new Map();

  function instantiateProvider(Cls: ClassType) {
    if (allProviders.has(Cls)) return allProviders.get(Cls);

    // get all the dependencies of the provider, and instantiate those first
    // not handling circular dependencies
    const deps = Reflect.getMetadata(DESIGN_PARAM_TYPES, Cls) ?? [];
    const params = deps.map(instantiateProvider);

    const instance = new Cls(...params);
    allProviders.set(Cls, instance); // cache it to be used when it is required next time

    return instance;
  }

  const controllers = Reflect.getMetadata(CONTROLLERS_KEY, module);

  controllers
    .filter((ControllerCls: ClassType) =>
      Reflect.hasOwnMetadata(CONTROLLER_PREFIX_KEY, ControllerCls)
    )
    .forEach((ControllerCls: ClassType) => {
      const params = Reflect.getMetadata(DESIGN_PARAM_TYPES, ControllerCls).map(
        instantiateProvider
      );
      const controller = new ControllerCls(...params);

      let prefix = Reflect.getMetadata(CONTROLLER_PREFIX_KEY, ControllerCls);
      if (prefix && !prefix.startsWith('/')) prefix = `/${prefix}`;

      Reflect.ownKeys(ControllerCls.prototype)
        .filter((property: string) => {
          return Reflect.hasOwnMetadata(
            HTTP_METHOD_KEY,
            ControllerCls.prototype,
            property
          );
        })
        .forEach((method: string) => {
          const paramsMeta =
            Reflect.getMetadata(PARAMS_META_KEY, ControllerCls.prototype, method) ?? {};

          const path = Reflect.getMetadata(PATH_KEY, controller, method);
          const httpMethod = Reflect.getMetadata(HTTP_METHOD_KEY, controller, method);

          const fullPath = `${prefix}${path}`;
          app[httpMethod](fullPath, async (req, res) => {
            const params = Reflect.getMetadata(
              DESIGN_PARAM_TYPES,
              ControllerCls.prototype,
              method
            ).map((param, index) => {
              const paramMeta = paramsMeta[index];
              if (paramMeta?.type === HandlerParamType.PATH_PARAM) {
                if (paramMeta.key) return req.params[paramMeta.key];
                else return req.params;
              }
              return undefined;
            });
            res.send(await controller[method](...params));
          });
        });
    });
  return app;
}
