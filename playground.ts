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