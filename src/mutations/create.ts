import { getPrimaryKeyColumnName } from "../helper";
import { executeCreateOneMutation, executeCreateManyMutation } from "./create-executor";
import type { ExecutionContext } from "../types/context";
import type { AnyTable } from "../types";
import { logger } from "../helper/logger-helper";

export async function executeCreateOne(
  ctx: ExecutionContext<any, any>,
  baseTable: AnyTable,
) {
  const { params, tableName } = ctx;
  logger.debug(`Executing createOne for ${tableName}`);
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
  const { params, tableName } = ctx;
  logger.debug(`Executing createMany for ${tableName}`);
  const pkName = getPrimaryKeyColumnName(baseTable);

  return await executeCreateManyMutation(
    ctx,
    baseTable,
    pkName,
    params.data
  );
}
