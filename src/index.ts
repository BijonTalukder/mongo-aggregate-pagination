import { Model, Document, PipelineStage } from "mongoose";

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
    }
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
}

export const mongoAdapter = new MongoAdapter();
