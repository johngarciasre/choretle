const debug = () => {};
const info = (msg: string, data?: Record<string, unknown>) => console.info(msg, data ?? "");
const warn = (msg: string, data?: Record<string, unknown>) => console.warn(msg, data ?? "");
const error = (msg: string, data?: Record<string, unknown>) => console.error(msg, data);

export { debug, info, warn, error };
