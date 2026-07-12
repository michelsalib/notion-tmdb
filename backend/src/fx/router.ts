import type { Context, Elysia } from "elysia";
import { rootContainer, scopeContainer } from "./di.js";

export interface ScopedRequest {
  cookies: Record<string, string>;
  headers: Record<string, string | undefined>;
  query: Record<string, any>;
  body: any;
  hostname: string;
  host: string;
  url: string;
  protocol: string;
  port: number;
}

export interface ScopedReply {
  header(name: string, value: string): void;
  status(code: number): void;
  setCookie(name: string, value: string, opts?: { maxAge?: number }): void;
  clearCookie(name: string): void;
}

export interface RouteConfig {
  path: string;
  method: "GET" | "POST";
  authenticate: boolean;
}

interface RouteInvocation {
  serviceName: string;
  methodName: string;
  routeConfig: RouteConfig;
}

const registeredClasses = new WeakSet<object>();

export class Router {
  private static readonly invocations: RouteInvocation[] = [];

  static register<T extends object>(
    ClassRef: new (...args: any[]) => T,
    methodName: keyof T & string,
    routeConfig: RouteConfig,
  ): void {
    const serviceName = "_Router" + ClassRef.name;

    if (!registeredClasses.has(ClassRef)) {
      registeredClasses.add(ClassRef);
      rootContainer.register(serviceName, { useClass: ClassRef as any });
    }

    Router.invocations.push({
      serviceName,
      methodName,
      routeConfig,
    });
  }

  static load(app: Elysia): Elysia {
    for (const { methodName, routeConfig, serviceName } of Router.invocations) {
      const handler = async (ctx: Context) => {
        const { request, reply } = buildScopedContext(ctx);
        const container = await scopeContainer(
          request,
          reply,
          routeConfig.authenticate,
        );
        const service = container.resolve<any>(serviceName);
        return service[methodName](container);
      };

      if (routeConfig.method === "GET") {
        app.get(routeConfig.path, handler);
      } else {
        app.post(routeConfig.path, handler);
      }
    }
    return app;
  }
}

function buildScopedContext(ctx: Context): {
  request: ScopedRequest;
  reply: ScopedReply;
} {
  const cookies: Record<string, string> = {};
  for (const [name, slot] of Object.entries(
    ctx.cookie as Record<string, { value?: unknown }>,
  )) {
    if (slot?.value != null) {
      cookies[name] = String(slot.value);
    }
  }

  const headersObj: Record<string, string | undefined> = {};
  for (const [k, v] of ctx.request.headers as unknown as Iterable<
    [string, string]
  >) {
    headersObj[k.toLowerCase()] = v;
  }

  const url = new URL(ctx.request.url);
  const hostHeader = headersObj["host"] ?? url.host;
  const protocol = (
    headersObj["x-forwarded-proto"] ?? url.protocol.replace(":", "")
  )
    .split(",")[0]!
    .trim();
  const [hostname, portStr] = hostHeader.split(":");
  const port = portStr ? Number(portStr) : protocol === "https" ? 443 : 80;

  const request: ScopedRequest = {
    cookies,
    headers: headersObj,
    query: (ctx.query as Record<string, any>) ?? {},
    body: (ctx as { body?: unknown }).body,
    hostname: hostname ?? "",
    host: hostHeader,
    url: url.pathname + url.search,
    protocol,
    port,
  };

  const setHeaders = ctx.set.headers as Record<string, string>;
  const reply: ScopedReply = {
    header(name, value) {
      setHeaders[name] = value;
    },
    status(code) {
      ctx.set.status = code;
    },
    setCookie(name, value, opts) {
      const slot = ctx.cookie[name];
      if (!slot) return;
      slot.set({ value, ...opts });
    },
    clearCookie(name) {
      ctx.cookie[name]?.remove();
    },
  };

  return { request, reply };
}
