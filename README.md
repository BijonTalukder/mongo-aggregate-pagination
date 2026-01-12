````markdown
# MongoDB Aggregate Pagination

A powerful and type-safe MongoDB aggregation adapter with built-in pagination support for Mongoose.

## Features

- ✅ Type-safe aggregation with TypeScript
- ✅ Built-in pagination with metadata
- ✅ Support for lookups (joins)
- ✅ Custom sorting and filtering
- ✅ Projection support
- ✅ Optional pagination (get all results)
- ✅ Performance tracking
- ✅ Flexible pipeline customization

## Installation

```bash
npm install @BijonTalukder/mongo-aggregate-pagination
```
````

**Peer Dependencies:**

- mongoose: ^6.0.0 || ^7.0.0 || ^8.0.0

## Quick Start

```typescript
import { mongoAdapter } from "@yourusername/mongo-aggregate-pagination";
import { UserModel } from "./models/User";

// Paginated query
const result = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 1,
  limit: 10,
  match: { status: "active" },
  sort: { createdAt: -1 },
});

console.log(result.docs); // Array of documents
console.log(result.totalDocs); // Total count
console.log(result.hasNext); // Boolean
```

## API Reference

### `aggregateWithPagination<T>(model, options)`

#### Options

| Property         | Type               | Default       | Description                           |
| ---------------- | ------------------ | ------------- | ------------------------------------- |
| `page`           | `number \| string` | `1`           | Current page number                   |
| `limit`          | `number \| string` | `10`          | Items per page                        |
| `match`          | `object`           | `{}`          | MongoDB match query                   |
| `sort`           | `object`           | `{ _id: -1 }` | Sort configuration                    |
| `lookups`        | `LookupConfig[]`   | `[]`          | Array of lookup configurations        |
| `project`        | `object`           | -             | Projection fields                     |
| `extraStages`    | `PipelineStage[]`  | `[]`          | Additional pipeline stages            |
| `skipPagination` | `boolean`          | `false`       | Return all results without pagination |

#### Return Type (Paginated)

```typescript
{
  docs: T[];           // Array of documents
  totalDocs: number;   // Total document count
  page: number;        // Current page
  limit: number;       // Items per page
  pages: number;       // Total pages
  hasNext: boolean;    // Has next page
  hasPrev: boolean;    // Has previous page
}
```

## Examples

### Basic Pagination

```typescript
const users = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 2,
  limit: 20,
  match: { role: "admin" },
  sort: { name: 1 },
});
```

### With Lookups (Joins)

```typescript
const posts = await mongoAdapter.aggregateWithPagination(PostModel, {
  page: 1,
  limit: 10,
  lookups: [
    {
      from: "users",
      localField: "authorId",
      foreignField: "_id",
      as: "author",
    },
    {
      from: "comments",
      localField: "_id",
      foreignField: "postId",
      as: "comments",
      pipeline: [{ $match: { approved: true } }, { $limit: 5 }],
    },
  ],
});
```

### With Projection

```typescript
const result = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 1,
  limit: 10,
  project: {
    name: 1,
    email: 1,
    createdAt: 1,
    password: 0, // Exclude sensitive fields , use either 0 or 1 becouse mongodb rules
  },
});
```

### Projection Rules

MongoDB projection follows these rules:

- **Inclusion mode**: Specify fields to include with `1` (other fields automatically excluded)
- **Exclusion mode**: Specify fields to exclude with `0` (other fields automatically included)
- **Cannot mix**: You cannot use both `1` and `0` in the same projection (except for `_id`)
- **Exception**: `_id` can be excluded even when using inclusion mode

**Examples:**

```typescript
{ name: 1, email: 1 }

{ name: 1, email: 1, _id: 0 }


{ password: 0 }
```

### Without Pagination

```typescript
const allUsers = await mongoAdapter.aggregateWithPagination(UserModel, {
  match: { status: "active" },
  sort: { createdAt: -1 },
  skipPagination: true,
});
// Returns: T[]
```

### Complex Aggregation

```typescript
const analytics = await mongoAdapter.aggregateWithPagination(OrderModel, {
  page: 1,
  limit: 50,
  match: {
    createdAt: { $gte: new Date("2024-01-01") },
  },
  lookups: [
    {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer",
    },
  ],
  extraStages: [
    {
      $addFields: {
        totalAmount: { $sum: "$items.price" },
      },
    },
  ],
  sort: { totalAmount: -1 },
  project: {
    orderNumber: 1,
    totalAmount: 1,
    "customer.name": 1,
    "customer.email": 1,
  },
});
```

## TypeScript Support

Full TypeScript support with type inference:

```typescript
interface User {
  _id: string;
  name: string;
  email: string;
}

const result = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 1,
  limit: 10,
});

// result.docs is typed as User[]
```

## Performance

The adapter executes count and data queries in parallel for optimal performance. Execution time is logged to console:

```
[MongoAdapter] Aggregation runtime: 45ms
```

## Error Handling

```typescript
try {
  const result = await mongoAdapter.aggregateWithPagination(UserModel, {
    page: "invalid", // Will throw error
    limit: 10,
  });
} catch (error) {
  console.error(error.message); // "page must be a positive number"
}
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions, please use the [GitHub issue tracker](https://github.com/BijonTalukder/mongo-aggregate-pagination/issues).

```

```
