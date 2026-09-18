export class OrderError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "OrderError";
  }
}

export const notFound = (msg = "Order not found") => new OrderError(msg, 404);
export const forbidden = (msg = "Not permitted") => new OrderError(msg, 403);
export const conflict = (msg: string) => new OrderError(msg, 409);
export const badRequest = (msg: string) => new OrderError(msg, 400);
