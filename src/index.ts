import { Model, Document, PipelineStage, Types } from "mongoose";

export interface PaginatedResult<T = any> {
  docs: T[];

  totalDocs: number;
  page: number;
  limit: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface BaseOptions {
  sort?: Record<string, 1 | -1>;
  match?: any;
  lookups?: LookupConfig[];
  project?: Record<string, any>;
  extraStages?: PipelineStage[];
}

interface PaginatedOptions extends BaseOptions {
  page?: number | string;
  limit?: number | string;
  skipPagination?: false;
}
interface NonPaginatedOptionsWithLimit extends BaseOptions {
  skipPagination?: boolean;
}
interface NonPaginatedOptions extends BaseOptions {
  skipPagination: true;
  limit?: number | string;
}
type AggregateOptions =
  | PaginatedOptions
  | NonPaginatedOptions
  | NonPaginatedOptions;

// NEW: Cursor pagination result type
export interface CursorPaginatedResult<T = any> {
  docs: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// NEW: Cursor pagination options
interface CursorPaginationOptions extends BaseOptions {
  cursor?: string;
  limit?: number | string;
}

export interface LookupConfig {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
  pipeline?: PipelineStage[];
  unwind?: boolean | { preserveNullAndEmptyArrays: boolean };
}
//A reusable MongoDB aggregation adapter that provides built-in pagination support
export class MongoAdapter {
  private parsePositiveInt(
    value: unknown,
    fieldName: string,
    defaultValue: number,
  ): number {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }

    const num = Number(value);

    if (!Number.isInteger(num) || num <= 0) {
      throw new Error(`${fieldName} must be a positive number`);
    }

    return num;
  }

  async aggregateWithPagination<T>(
    model: Model<T>,
    options: NonPaginatedOptions,
  ): Promise<T[]>;

  async aggregateWithPagination<T>(
    model: Model<T>,
    options?: PaginatedOptions,
  ): Promise<PaginatedResult<T>>;

  async aggregateWithPagination<T>(
    model: Model<T>,
    options?: NonPaginatedOptionsWithLimit,
  ): Promise<T[]>;

  async aggregateWithPagination<T>(
    model: Model<T>,
    options: AggregateOptions = {},
  ): Promise<PaginatedResult<T> | T[]> {
    const startTime = Date.now();
    try {
      const {
        sort = { _id: -1 },
        match = {},
        lookups = [],
        project,
        skipPagination,
        extraStages = [],
      } = options;

      //! Build base pipeline
      const pipeline = [];

      //! Add match stage
      if (Object.keys(match).length > 0) {
        pipeline.push({ $match: match });
      }

      //! Add lookups
      lookups.forEach((lookup) => {
        pipeline.push({
          $lookup: {
            from: lookup.from,
            localField: lookup.localField,
            foreignField: lookup.foreignField,
            as: lookup.as,
            pipeline: lookup.pipeline || [],
          },
        });

        // Handle unwind
        if (lookup.unwind) {
          if (typeof lookup.unwind === "boolean") {
            pipeline.push({ $unwind: `$${lookup.as}` });
          } else {
            pipeline.push({
              $unwind: {
                path: `$${lookup.as}`,
                ...lookup.unwind,
              },
            });
          }
        }
      });

      pipeline.push(...extraStages);
      //! Add sort
      pipeline.push({ $sort: sort });

      //! Add project if specified
      if (project) {
        pipeline.push({ $project: project });
      }

      if (skipPagination) {
        const pipelineWithLimit: PipelineStage[] = [...pipeline];
        if (options.limit != null) {
          const limit = this.parsePositiveInt(options.limit, "limit", 0);
          pipelineWithLimit.push({ $limit: limit });
        }
        return model.aggregate<T>(pipelineWithLimit).exec();
      }

      const page = this.parsePositiveInt(options.page, "page", 1);
      const limit = this.parsePositiveInt(options.limit, "limit", 10);
      const skip = (page - 1) * limit;

      //! Pipeline for data with pagination
      const dataPipeline: PipelineStage[] = [
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
      ];

      //! Pipeline for count only
      const countPipeline: PipelineStage[] = [...pipeline, { $count: "total" }];

      //! Execute both in parallel
      const [data, countResult] = await Promise.all([
        model.aggregate(dataPipeline).exec(),
        model.aggregate(countPipeline).exec(),
      ]);

      const total = countResult[0]?.total || 0;
      const pages = Math.ceil(total / limit);
      const runtimeMs = Date.now() - startTime;
      console.log(`[MongoAdapter] Aggregation runtime: ${runtimeMs}ms`);
      return {
        docs: data,
        totalDocs: total,
        page,
        limit,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1,
      };
    } catch (error) {
      this.handleError(error, options);
      throw error;
    }
  }
  async aggregateWithCursorPagination<T>(
    model: Model<T>,
    options: CursorPaginationOptions = {},
  ): Promise<CursorPaginatedResult<T>> {
    const startTime = Date.now();
    try {
      const {
        cursor,
        limit = 20,
        sort = { _id: 1 },
        match = {},
        lookups = [],
        project,
        extraStages = [],
      } = options;
      const parsedLimit = this.parsePositiveInt(limit, "limit", 20);
      const pipeline: PipelineStage[] = [];
      const cursorMatch = { ...match };
      if (cursor) {
        const sortField = Object.keys(sort)[0] || "_id";
        const sortDirection = sort[sortField];

        if (sortDirection === 1) {
          cursorMatch[sortField] = { $gt: this.parseCursor(cursor, sortField) };
        } else {
          cursorMatch[sortField] = { $lt: this.parseCursor(cursor, sortField) };
        }
      }
      if (Object.keys(cursorMatch).length > 0) {
        pipeline.push({ $match: cursorMatch });
      }
      lookups.forEach((lookup) => {
        pipeline.push({
          $lookup: {
            from: lookup.from,
            localField: lookup.localField,
            foreignField: lookup.foreignField,
            as: lookup.as,
            pipeline: lookup.pipeline || [],
          },
        });

        // Handle unwind
        if (lookup.unwind) {
          if (typeof lookup.unwind === "boolean") {
            pipeline.push({ $unwind: `$${lookup.as}` });
          } else {
            pipeline.push({
              $unwind: {
                path: `$${lookup.as}`,
                ...lookup.unwind,
              },
            });
          }
        }
      });

      //! Add extra stages
      pipeline.push(...extraStages);

      //! Add sort
      pipeline.push({ $sort: sort });

      //! Add project if specified
      if (project) {
        pipeline.push({ $project: project });
      }

      //! Fetch one extra item to determine if there are more results
      pipeline.push({ $limit: parsedLimit + 1 });

      const results = await model.aggregate<T>(pipeline).exec();

      const hasMore = results.length > parsedLimit;
      const docs = hasMore ? results.slice(0, parsedLimit) : results;

      //! Generate next cursor
      let nextCursor: string | null = null;
      if (hasMore && docs.length > 0) {
        const lastDoc: any = docs[docs.length - 1];
        const sortField = Object.keys(sort)[0] || "_id";
        nextCursor = this.generateCursor(lastDoc[sortField]);
      }

      const runtimeMs = Date.now() - startTime;
      console.log(`[MongoAdapter] Cursor pagination runtime: ${runtimeMs}ms`);

      return {
        docs,
        nextCursor,
        hasMore,
      };
    } catch (error) {
    } finally {
    }
  }

  private generateCursor(value: any): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  }
  private handleError(error: any, options: AggregateOptions): void {
    const errorContext = {
      page: options.page,
      limit: options.limit,
      hasMatch: !!options.match && Object.keys(options.match).length > 0,
      lookupsCount: options.lookups?.length || 0,
      extraStagesCount: options.extraStages?.length || 0,
    };

    // Enhanced error logging
    if (error.name === "MongooseError") {
      console.error("[MongoAdapter] Mongoose Error:", {
        message: error.message,
        context: errorContext,
      });
    } else if (error.code === 11000) {
      console.error("[MongoAdapter] Duplicate Key Error:", errorContext);
    } else if (error.name === "ValidationError") {
      console.error("[MongoAdapter] Validation Error:", {
        errors: error.errors,
        context: errorContext,
      });
    } else {
      console.error("[MongoAdapter] Unexpected Error:", {
        error,
        context: errorContext,
      });
    }
  }

  private parseCursor(cursor: string, field: string): any {
    if (field === "_id" && cursor.match(/^[0-9a-fA-F]{24}$/)) {
      return new Types.ObjectId(cursor);
    }

    const dateValue = new Date(cursor);
    if (!isNaN(dateValue.getTime()) && cursor.includes("-")) {
      return dateValue;
    }

    const numValue = Number(cursor);
    if (!isNaN(numValue) && cursor === String(numValue)) {
      return numValue;
    }

    // Return as string
    return cursor;
  }
}

export const mongoAdapter = new MongoAdapter();
