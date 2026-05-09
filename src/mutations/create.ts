import { getPrimaryKeyColumnName } from "../helper";
import { executeCreateOneMutation, executeCreateManyMutation } from "./create-executor";
import type { MiddlewareContext } from "../middleware/index";

export async function executeCreateOne(
  ctx: MiddlewareContext,
  baseTable: any,
) {
  const { params } = ctx;
  const pkName = getPrimaryKeyColumnName(baseTable);

  return await executeCreateOneMutation(
    ctx,
    baseTable,
    pkName,
    params.data
  );
}

export async function executeCreateMany(
  ctx: MiddlewareContext,
  baseTable: any,
) {
  const { params } = ctx;
  const pkName = getPrimaryKeyColumnName(baseTable);

  return await executeCreateManyMutation(
    ctx,
    baseTable,
    pkName,
    params.data
  );
}
