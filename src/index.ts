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
interface NonPaginatedOptions extends BaseOptions {
  skipPagination: true;
}
type AggregateOptions = PaginatedOptions | NonPaginatedOptions;

export interface LookupConfig {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
  pipeline?: PipelineStage[];
}
//A reusable MongoDB aggregation adapter that provides built-in pagination support
export class MongoAdapter {
  private parsePositiveInt(
    value: unknown,
    fieldName: string,
    defaultValue: number
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
    options: NonPaginatedOptions
  ): Promise<T[]>;

  async aggregateWithPagination<T>(
    model: Model<T>,
    options?: PaginatedOptions
  ): Promise<PaginatedResult<T>>;

  async aggregateWithPagination<T>(
    model: Model<T>,
    options: AggregateOptions = {}
  ): Promise<PaginatedResult<T> | T[]> {
    const startTime = Date.now();
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
      return model.aggregate<T>(pipeline).exec();
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
  }
}

export const mongoAdapter = new MongoAdapter();
