import { getPrimaryKeyColumnName } from "../helper";
import { executeCreateOneMutation, executeCreateManyMutation } from "./create-executor";
import type { ExecutionContext } from "../types/context";
import type { AnyTable } from "../types";

export async function executeCreateOne(
  ctx: ExecutionContext<any, any>,
  baseTable: AnyTable,
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
  ctx: ExecutionContext<any, any>,
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
