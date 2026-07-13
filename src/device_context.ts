import { AsyncLocalStorage } from "node:async_hooks";

export interface DeviceExecutionContext {
  session: string;
  deviceKey: string;
}

const storage = new AsyncLocalStorage<DeviceExecutionContext>();

export function runWithDeviceContext<T>(context: DeviceExecutionContext, run: () => Promise<T>): Promise<T> {
  return storage.run(context, run);
}

export function currentDeviceExecution(): DeviceExecutionContext | undefined {
  return storage.getStore();
}
