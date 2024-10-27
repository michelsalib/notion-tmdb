import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Container, injectable, METADATA_KEY } from "inversify";
import { rootContainer, scopeContainer } from "./di.js";

type RouteTarget = (container: Container) => Promise<any>;

export interface RouteConfig {
  path: string;
  method: "GET" | "POST";
  authenticate: boolean;
  priority?: "last";
}

export interface RouteInvocation {
  routeConfig: RouteConfig;
  methodName: string;
  serviceName: string;
}

export function route(routeConfig: RouteConfig) {
  return (
    target: object,
    propertyKey: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- as it helps enforce the decorator target type
    descriptor: TypedPropertyDescriptor<RouteTarget>,
  ) => {
    const serviceName = "_Router" + target.constructor.name;

    Router.register({
      routeConfig,
      serviceName,
      methodName: propertyKey,
    });

    // configure service
    if (!Reflect.hasOwnMetadata(METADATA_KEY.PARAM_TYPES, target.constructor)) {
      rootContainer.bind(serviceName).to(target.constructor as any);
      injectable()(target.constructor as any);
    }
  };
}

export class Router {
  private static readonly invocations: RouteInvocation[] = [];

  static register(invocation: RouteInvocation) {
    Router.invocations.push(invocation);
  }

  static load(app: FastifyInstance) {
    for (const { methodName, routeConfig, serviceName } of Router.invocations) {
      app.route({
        method: routeConfig.method,
        url: routeConfig.path,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
          const container = await scopeContainer(
            request,
            reply,
            routeConfig.authenticate,
          );
          const routingService = container.get<any>(serviceName);

          return routingService[methodName](container);
        },
      });
    }
  }

  static async execute(method: "GET" | "POST", path: string, request: FastifyRequest): Promise<any> {
    const { methodName, routeConfig, serviceName } = Router.invocations.find(i => i.routeConfig.method == method && i.routeConfig.path == path)!;

    const container = await scopeContainer(
      request,
      undefined as any,
      routeConfig.authenticate,
    );
    const routingService = container.get<any>(serviceName);

    return routingService[methodName](container);
  }
}
