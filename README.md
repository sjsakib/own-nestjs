# Making your own NestJS

It can be a little overwhelming when using [NestJS ]() for the first time. Let's try to understand how some of it's components work.

## Before you start

I am assuming that you are familiar with NestJS and the features it provides. Most of the features that feels like black magic is achieved with [decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) and [experimental metadata API](https://github.com/rbuckton/reflect-metadata). Make sure you have basic understanding of these.

I've set up the project with necessary config to run the working snippets I am about to share. You can put them in the [playground.ts](./playground.ts) file and run them with the command `npm run playground`. Once you are done playing around with the snippets, you can see all of them coming together in the [lib.ts](./lib.ts) file.

## Defining routes

The key here is that, decorators can attach metadata to classes and methods, and those metadata can be accessed later on runtime. Let's dive right in.

```ts
import 'reflect-metadata';

const PATH_KEY = Symbol('path');
const HTTP_METHOD_KEY = Symbol('method');

/**
 * Post is a decorator factory that takes a path and returns a decorator.
 * That decorator attaches the path and the HTTP method post to the class method it is applied to.
 **/
function Post(path: string) {
  return function (target: any, key: string) {
    Reflect.defineMetadata(PATH_KEY, path, target, key);
    Reflect.defineMetadata(HTTP_METHOD_KEY, 'post', target, key);
  };
}
/* 👆 these are codes that the framework might provide */

/* So user can write something like this */
class AuthRoute {
  @Post('/login')
  async login() {
    return 'login success';
  }
}

/* Then the framework can use the class to create the actual routes */
function createApp(ControllerCls: any) {
  // first get all the properties of that class
  const properties = Object.getOwnPropertyNames(ControllerCls.prototype);
  properties
    .filter(
      (
        method // keep the ones that as HTTP method metadata
      ) => Reflect.hasOwnMetadata(HTTP_METHOD_KEY, ControllerCls.prototype, method)
    )
    .forEach(method => {
      const path = Reflect.getMetadata(PATH_KEY, ControllerCls.prototype, method);
      const httpMethod = Reflect.getMetadata(
        HTTP_METHOD_KEY,
        ControllerCls.prototype,
        method
      );
      console.log(`Mapping: ${httpMethod.toUpperCase()} ${path}`);
      // now that we have access to the method name and path at runtime,
      // these could be attached to an express app
    });
}

createApp(AuthRoute);
```

Note that, using [symbol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) is not mandatory here, could just use plain strings for the keys.

## Dependency injection

The basic idea of dependency injection is that instead of instantiating the dependencies of a class in the constructor, you pass the dependencies to the constructor. The mystical thing that NestJS does here is, you can define the dependencies in the constructor with shorthand express like `constructor(private service: Service)` and NestJS will do the instantiating and pass it down to the constructor for you. Let's see how something like that is possible.

Again metadata API comes into play. The parameters of a constructors is available with the `design:paramtypes` key in the metadata. The catch is that, the class has to be decorated with at least one decorator. Otherwise typescript will not record the parameter data while transpiling to runnable javascript. This is where the `@Injectable()` decorator comes into play. You might have noticed that NestJS will have you decorate the controllers with the `Controller()` decorator even when no controller prefix is required. This is because all classes need to be decorated with at least one decorator in order for them to be instantiated with correct params.

```ts
import 'reflect-metadata';

function Injectable() {
  return function (target: any) {}; // it doesn't have to do anything
}

class UserRepository {
  async findUser() {
    return 'user exists';
  }
}

@Injectable()
class AuthService {
  constructor(private readonly authService: UserRepository) {}
  login() {
    return this.authService.findUser();
  }
}

function instantiate(ProviderCls: any) {
  const params = Reflect.getMetadata('design:paramtypes', ProviderCls).map(
    DependencyCls => new DependencyCls()
  );

  const provider = new ProviderCls(...params);

  provider.login().then(console.log);
}

instantiate(AuthService);
```

Note that, it didn't need to be a decorator factory, since it is not taking params. We could define it like `function Injectable(target: any) {}` then it could be used like `@Injectable`, without the braces. Just making it look like the other decorators.

## What about passing data down to the route handlers?

With a similar technique, parameters can be decorated to indicate what kind of data is needed in that parameter, and then the framework can pass down the appropriate data, taking form the underlying platform.

```ts
import 'reflect-metadata';

const HTTP_METHOD_KEY = Symbol('method');
const PATH_KEY = Symbol('path');
const PARAMS_META_KEY = Symbol('paramsMeta');

// just like the first snippet
function Get(path: string) {
  return function (target: any, key: string) {
    Reflect.defineMetadata(PATH_KEY, path, target, key);
    Reflect.defineMetadata(HTTP_METHOD_KEY, 'get', target, key);
  };
}

// decorator to indicate that data is required from route parameter
export function Param(key: string) {
  return function (target: any, methodName: string, index: number) {
    const paramsMeta = Reflect.getMetadata(PARAMS_META_KEY, target, methodName) ?? {};
    paramsMeta[index] = { key, type: 'route_param' };
    Reflect.defineMetadata(PARAMS_META_KEY, paramsMeta, target, methodName);
  };
}

class AuthRoute {
  @Get('/profile/:id')
  async profile(@Param('id') id: string) {
    return `user: ${id}`;
  }
}

function createApp(ControllerCls: any) {
  Object.getOwnPropertyNames(ControllerCls.prototype)
    .filter(method =>
      Reflect.hasOwnMetadata(HTTP_METHOD_KEY, ControllerCls.prototype, method)
    )
    .forEach(method => {
      const PARAM_DATA = { id: '123' }; // could get from req.params

      const paramsMeta =
        Reflect.getMetadata(PARAMS_META_KEY, ControllerCls.prototype, method) ?? {};

      const paramsToPass = Reflect.getMetadata(
        'design:paramtypes',
        ControllerCls.prototype,
        method
      ).map((_, index) => {
        const { key, type } = paramsMeta[index];
        if (type === 'route_param') return PARAM_DATA[key];
        return null;
      });
      ControllerCls.prototype[method](...paramsToPass).then(console.log);
    });
}

createApp(AuthRoute);
```

## Putting it all together

I've tried to keep the snippets as short and easy to understand as possible. You can see the [lib.ts](/lib.ts) where I've put them together with actual express. And in the [index.ts](./index.ts) there is a working web app using this 'framework'. Their you have it, a nestjs-like framework on top of express under 200 lines of code. It doesn't handle a lot of things of course, but it is a good starting point to understand how a framework like NestJS works under the hood.

Thanks for reading. Leave a star if you liked it.
