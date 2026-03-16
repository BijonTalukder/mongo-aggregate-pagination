# mongoose-aggregate-paginate

A powerful and type-safe MongoDB aggregation adapter with built-in pagination support for Mongoose.

[![npm version](https://img.shields.io/npm/v/mongoose-aggregate-paginate.svg)](https://www.npmjs.com/package/mongoose-aggregate-paginate)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- ✅ **Type-safe** aggregation with full TypeScript support
- ✅ **Built-in pagination** with comprehensive metadata
- ✅ **Flexible queries** - support for lookups (joins), sorting, filtering
- ✅ **Projection support** - control which fields to include/exclude
- ✅ **Optional pagination** - get all results when needed
- ✅ **Performance tracking** - automatic runtime logging
- ✅ **Custom pipelines** - add any MongoDB aggregation stages
- ✅ **Input validation** - automatic validation of page and limit parameters

## 📦 Installation

```bash
npm install mongoose-aggregate-paginate
```

**Peer Dependencies:**

- mongoose: ^6.0.0 || ^7.0.0 || ^8.0.0

## 🚀 Quick Start

```typescript
import { mongoAdapter } from "mongoose-aggregate-paginate";
import { UserModel } from "./models/User";

// Basic paginated query
const result = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 1,
  limit: 10,
  match: { status: "active" },
  sort: { createdAt: -1 },
});

console.log(result.docs); // Array of documents
console.log(result.totalDocs); // Total count
console.log(result.page); // Current page
console.log(result.pages); // Total pages
console.log(result.hasNext); // Has next page
console.log(result.hasPrev); // Has previous page
```

## 📚 API Reference

### `aggregateWithPagination<T>(model, options)`

The main method for executing paginated aggregation queries.

#### Options

| Property         | Type               | Default       | Description                            |
| ---------------- | ------------------ | ------------- | -------------------------------------- |
| `page`           | `number \| string` | `1`           | Current page number                    |
| `limit`          | `number \| string` | `10`          | Items per page                         |
| `match`          | `object`           | `{}`          | MongoDB match query (filter)           |
| `sort`           | `object`           | `{ _id: -1 }` | Sort configuration                     |
| `lookups`        | `LookupConfig[]`   | `[]`          | Array of lookup (join) configurations  |
| `project`        | `object`           | -             | Projection fields (include/exclude)    |
| `extraStages`    | `PipelineStage[]`  | `[]`          | Additional aggregation pipeline stages |
| `skipPagination` | `boolean`          | `false`       | Return all results without pagination  |

#### LookupConfig

```typescript
interface LookupConfig {
  from: string; // Collection to join
  localField: string; // Field from input documents
  foreignField: string; // Field from 'from' collection
  as: string; // Output array field name
  pipeline?: PipelineStage[]; // Optional sub-pipeline for the lookup
}
```

#### Return Type (Paginated)

```typescript
interface PaginatedResult<T> {
  docs: T[]; // Array of documents
  totalDocs: number; // Total document count
  page: number; // Current page number
  limit: number; // Items per page
  pages: number; // Total number of pages
  hasNext: boolean; // Whether there is a next page
  hasPrev: boolean; // Whether there is a previous page
}
```

#### Return Type (Non-Paginated)

When `skipPagination: true`, returns `T[]` - a simple array of documents.

## 💡 Usage Examples

### Basic Pagination

```typescript
const users = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 2,
  limit: 20,
  match: { role: "admin" },
  sort: { name: 1 },
});

console.log(`Showing ${users.docs.length} of ${users.totalDocs} users`);
console.log(`Page ${users.page} of ${users.pages}`);
```

### With String Parameters (from Query Params)

```typescript
// Works with query strings from Express, Next.js, etc.
const result = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: req.query.page, // "2"
  limit: req.query.limit, // "20"
  match: { status: "active" },
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
      pipeline: [
        { $match: { approved: true } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
      ],
    },
  ],
});

// Result structure:
// {
//   docs: [
//     {
//       _id: "...",
//       title: "Post Title",
//       author: [{ _id: "...", name: "John" }],  // Array from lookup
//       comments: [{ text: "Great post!" }, ...]
//     }
//   ],
//   totalDocs: 100,
//   page: 1,
//   ...
// }
```

### With Projection

Control which fields are returned in the results.

```typescript
const result = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 1,
  limit: 10,
  project: {
    name: 1,
    email: 1,
    createdAt: 1,
    password: 0, // Exclude sensitive fields
  },
});
```

**Projection Rules:**

MongoDB projection follows these rules:

- **Inclusion mode**: Specify fields to include with `1`

  ```typescript
  { name: 1, email: 1 }  // Only returns name and email (+ _id)
  ```

- **Exclusion mode**: Specify fields to exclude with `0`

  ```typescript
  { password: 0, secret: 0 }  // Returns all fields except password and secret
  ```

- **Cannot mix**: You cannot use both `1` and `0` in the same projection (except for `_id`)

- **`_id` exception**: `_id` can be excluded even in inclusion mode
  ```typescript
  { name: 1, email: 1, _id: 0 }  // Valid: only name and email, no _id
  ```

### Without Pagination (Get All Results)

```typescript
const allUsers = await mongoAdapter.aggregateWithPagination(UserModel, {
  match: { status: "active" },
  sort: { createdAt: -1 },
  skipPagination: true,
});

// Returns: User[] (simple array)
console.log(allUsers.length);
```

### With Limit but No Pagination

```typescript
const topUsers = await mongoAdapter.aggregateWithPagination(UserModel, {
  match: { status: "active" },
  sort: { points: -1 },
  skipPagination: true,
  limit: 100, // Get top 100 users
});

// Returns: User[] (array of top 100)
```

### Complex Aggregation Pipeline

```typescript
const analytics = await mongoAdapter.aggregateWithPagination(OrderModel, {
  page: 1,
  limit: 50,
  match: {
    createdAt: { $gte: new Date("2024-01-01") },
    status: "completed",
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
        itemCount: { $size: "$items" },
      },
    },
    {
      $match: {
        totalAmount: { $gte: 100 }, // Filter after calculation
      },
    },
  ],
  sort: { totalAmount: -1 },
  project: {
    orderNumber: 1,
    totalAmount: 1,
    itemCount: 1,
    "customer.name": 1,
    "customer.email": 1,
  },
});
```

### Advanced Filtering

```typescript
const results = await mongoAdapter.aggregateWithPagination(ProductModel, {
  page: 1,
  limit: 20,
  match: {
    $and: [
      { price: { $gte: 10, $lte: 100 } },
      { category: { $in: ["electronics", "books"] } },
      { inStock: true },
    ],
  },
  sort: { price: 1 },
});
```

## 🎨 TypeScript Support

Full TypeScript support with type inference:

```typescript
interface User {
  _id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  createdAt: Date;
}

interface Post {
  _id: string;
  title: string;
  authorId: string;
  author?: User[]; // After lookup
}

// Result is properly typed
const result = await mongoAdapter.aggregateWithPagination<Post>(PostModel, {
  page: 1,
  limit: 10,
  lookups: [
    {
      from: "users",
      localField: "authorId",
      foreignField: "_id",
      as: "author",
    },
  ],
});

// TypeScript knows the types
result.docs.forEach((post) => {
  console.log(post.title); // ✅ Type-safe
  console.log(post.author?.[0]?.name); // ✅ Type-safe
});
```

### Type Overloads

The library provides proper type overloads for different usage patterns:

```typescript
// Paginated - returns PaginatedResult<T>
const paginated = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 1,
  limit: 10,
});
// Type: PaginatedResult<User>

// Non-paginated - returns T[]
const all = await mongoAdapter.aggregateWithPagination(UserModel, {
  skipPagination: true,
});
// Type: User[]

// With limit but no pagination - returns T[]
const limited = await mongoAdapter.aggregateWithPagination(UserModel, {
  skipPagination: true,
  limit: 100,
});
// Type: User[]
```

## ⚡ Performance

The adapter executes count and data queries in **parallel** using `Promise.all()` for optimal performance.

**Performance Logging:**

Every query logs its execution time:

```
[MongoAdapter] Aggregation runtime: 45ms
```

This helps you identify slow queries and optimize your aggregation pipelines.

**Performance Tips:**

1. **Use indexes** - Ensure your match fields are indexed
2. **Match early** - Put `$match` stages as early as possible
3. **Project late** - Only use `$project` at the end if needed
4. **Limit lookups** - Each lookup is a join, use sparingly
5. **Use pipeline in lookups** - Filter data in lookup pipelines to reduce data transfer

## 🔧 Real-World Use Cases

### E-commerce Product Listing

```typescript
const products = await mongoAdapter.aggregateWithPagination(ProductModel, {
  page: parseInt(req.query.page) || 1,
  limit: 24,
  match: {
    category: "electronics",
    inStock: true,
    price: { $gte: minPrice, $lte: maxPrice },
  },
  lookups: [
    {
      from: "reviews",
      localField: "_id",
      foreignField: "productId",
      as: "reviews",
      pipeline: [{ $match: { rating: { $gte: 4 } } }, { $limit: 3 }],
    },
  ],
  sort: { popularity: -1 },
});
```

### Blog Posts with Authors

```typescript
const posts = await mongoAdapter.aggregateWithPagination(PostModel, {
  page: 1,
  limit: 10,
  match: {
    published: true,
    publishedAt: { $lte: new Date() },
  },
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
    },
  ],
  extraStages: [
    {
      $addFields: {
        commentCount: { $size: "$comments" },
      },
    },
  ],
  sort: { publishedAt: -1 },
  project: {
    title: 1,
    excerpt: 1,
    publishedAt: 1,
    "author.name": 1,
    "author.avatar": 1,
    commentCount: 1,
  },
});
```

### Admin User Management

```typescript
const users = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: parseInt(req.query.page) || 1,
  limit: 50,
  match: req.query.role ? { role: req.query.role } : {},
  lookups: [
    {
      from: "orders",
      localField: "_id",
      foreignField: "userId",
      as: "orders",
    },
  ],
  extraStages: [
    {
      $addFields: {
        orderCount: { $size: "$orders" },
        totalSpent: { $sum: "$orders.total" },
      },
    },
  ],
  sort: { createdAt: -1 },
  project: {
    password: 0, // Exclude sensitive data
  },
});
```

### Sales Analytics Dashboard

```typescript
const salesData = await mongoAdapter.aggregateWithPagination(OrderModel, {
  page: 1,
  limit: 100,
  match: {
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
    status: "completed",
  },
  lookups: [
    {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer",
    },
    {
      from: "products",
      localField: "items.productId",
      foreignField: "_id",
      as: "products",
    },
  ],
  extraStages: [
    {
      $addFields: {
        totalAmount: { $sum: "$items.price" },
        itemCount: { $size: "$items" },
      },
    },
  ],
  sort: { totalAmount: -1 },
});
```

## 🛡️ Error Handling

The adapter includes automatic input validation:

```typescript
try {
  const result = await mongoAdapter.aggregateWithPagination(UserModel, {
    page: "invalid", // Will throw error
    limit: -5, // Will throw error
  });
} catch (error) {
  console.error(error.message);
  // "page must be a positive number"
  // or "limit must be a positive number"
}
```

**Validation Rules:**

- `page` must be a positive integer (defaults to 1 if not provided)
- `limit` must be a positive integer (defaults to 10 if not provided)
- Empty strings are treated as undefined and use defaults
- String numbers are automatically converted: `"5"` → `5`

**Example Error Handling:**

```typescript
router.get("/users", async (req, res) => {
  try {
    const result = await mongoAdapter.aggregateWithPagination(UserModel, {
      page: req.query.page,
      limit: req.query.limit,
      match: { status: "active" },
    });

    res.json({
      success: true,
      data: result.docs,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalPages: result.pages,
        totalDocs: result.totalDocs,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});
```

## 📖 API Integration Examples

### Express.js REST API

```typescript
import express from "express";
import { mongoAdapter } from "mongoose-aggregate-paginate";
import { UserModel } from "./models/User";

const router = express.Router();

router.get("/api/users", async (req, res) => {
  const { page, limit, role, search } = req.query;

  const match: any = {};
  if (role) match.role = role;
  if (search) match.name = { $regex: search, $options: "i" };

  const result = await mongoAdapter.aggregateWithPagination(UserModel, {
    page,
    limit,
    match,
    sort: { createdAt: -1 },
  });

  res.json(result);
});
```

### Next.js API Route

```typescript
// pages/api/posts.ts
import { NextApiRequest, NextApiResponse } from "next";
import { mongoAdapter } from "mongoose-aggregate-paginate";
import { PostModel } from "@/models/Post";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { page = "1", limit = "10", category } = req.query;

  const result = await mongoAdapter.aggregateWithPagination(PostModel, {
    page,
    limit,
    match: category ? { category } : {},
    lookups: [
      {
        from: "users",
        localField: "authorId",
        foreignField: "_id",
        as: "author",
      },
    ],
    sort: { createdAt: -1 },
  });

  res.status(200).json(result);
}
```

### Frontend Integration (React)

```typescript
import { useState, useEffect } from "react";

function UserList() {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    const response = await fetch(`/api/users?page=${page}&limit=20`);
    const data = await response.json();

    setUsers(data.docs);
    setTotalPages(data.pages);
    setLoading(false);
  };

  return (
    <div>
      {loading ? <div>Loading...</div> : (
        <>
          <ul>
            {users.map(user => (
              <li key={user._id}>{user.name}</li>
            ))}
          </ul>

          <div>
            <button
              disabled={!data.hasPrev}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>

            <span>Page {page} of {totalPages}</span>

            <button
              disabled={!data.hasNext}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

## 🔄 Migration Guide

### From `mongoose-paginate-v2`

```typescript
// Before (mongoose-paginate-v2)
const result = await User.paginate(
  { status: "active" },
  { page: 1, limit: 10, sort: { name: 1 } },
);

// After (mongoose-aggregate-paginate)
const result = await mongoAdapter.aggregateWithPagination(UserModel, {
  page: 1,
  limit: 10,
  match: { status: "active" },
  sort: { name: 1 },
});
```

### From Manual Aggregation

```typescript
// Before (manual aggregation)
const skip = (page - 1) * limit;
const [data, total] = await Promise.all([
  Model.aggregate([
    { $match: { status: "active" } },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]),
  Model.countDocuments({ status: "active" }),
]);

// After (mongoose-aggregate-paginate)
const result = await mongoAdapter.aggregateWithPagination(Model, {
  page,
  limit,
  match: { status: "active" },
  sort: { createdAt: -1 },
});
```

## 📝 License

MIT © [Bijon Talukder](https://github.com/BijonTalukder)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Issues & Support

For bugs, questions, or feature requests:

- [GitHub Issues](https://github.com/BijonTalukder/mongoose-aggregate-paginate/issues)
- [NPM Package](https://www.npmjs.com/package/mongoose-aggregate-paginate)

## 🌟 Show Your Support

If this package helped you, please give it a ⭐️ on [GitHub](https://github.com/BijonTalukder/mongoose-aggregate-paginate)!

---

**Built with ❤️ for the MongoDB community**
