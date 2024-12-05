type ReducedObject<T, R> = {
  [K in keyof T]: T[K] extends R ? K : never;
}[keyof T];

export function retriable<
  T extends object,
  A extends ReducedObject<T, (...args: any[]) => Promise<any>>,
>(instance: T, action: A): T[A] {
  const callable: any = async (...args: any[]) => {
    const method: any = instance[action];

    try {
      return await method.call(instance, ...args);
    } catch (err) {
      console.error("Retry after ", err);

      return await method.call(instance, ...args);
    }
  };

  return callable;
}
