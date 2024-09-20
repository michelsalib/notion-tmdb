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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descriptor helps typing the decorator target
    descriptor: TypedPropertyDescriptor<RouteTarget>,
  ) => {
    const serviceName = "_Router" + target.constructor.name;

    const existingMetadata = Reflect.getMetadata("routes", target) || [];
    Reflect.defineMetadata(
      "routes",
      [
        ...existingMetadata,
        {
          routeConfig,
          serviceName,
          methodName: propertyKey,
        } as RouteInvocation,
      ],
      target,
    );
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
}