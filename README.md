# **MERN Application Documentation**

## **Table of Contents**

1. [Project Overview](#project-overview)
2. [Installation](#installation)
3. [Environment Variables](#environment-variables)
4. [Directory Structure](#directory-structure)
5. [API Documentation](#api-documentation)
   - [Authentication Routes](#authentication-routes)
   - [User Routes](#user-routes)
   - [Problem Routes](#problem-routes)
   - [Workshop Routes](#workshop-routes)
   - [Deal Routes](#deal-routes)
   - [Document Routes](#document-routes)
   - [Offer Routes](#offer-routes)
6. [Usage Examples](#usage-examples)
7. [Contributing](#contributing)

## **Project Overview**

This MERN (MongoDB, Express, React, Node.js) application is designed to facilitate communication between customers and workshops. The application allows customers to report problems, moderators to create documents about these problems, and workshops to submit offers. Users are categorized into four roles: Admins, Moderators, Workshops, and Customers.

## **Installation**

To set up the project on your local machine, follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/your-repo-name.git
   cd your-repo-name
   ```

2. **Install dependencies:**

   Navigate to the server directory and install the required packages.

   ```bash
   cd server
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env` file in the root of the server directory and populate it with the following values:

   ```bash
   MONGO_URI=mongodb://localhost:27017/your_database_name
   JWT_SECRET=your_secret_key
   JWT_EXPIRES_IN=1h
   PORT=5000
   ```

4. **Run the server:**

   ```bash
   npm start
   ```

## **Environment Variables**

| Variable         | Description                                   |
|------------------|-----------------------------------------------|
| `MONGO_URI`      | MongoDB connection string.                    |
| `JWT_SECRET`     | Secret key for signing JWT tokens.            |
| `JWT_EXPIRES_IN` | Duration for which JWT tokens are valid.      |
| `PORT`           | Port number on which the server runs.        |

## **Directory Structure**

```plaintext
/server
    ├── /controllers
    ├── /middleware
    ├── /models
    ├── /routes
    ├── /utils
    ├── .env
    ├── server.js
    └── package.json
```

## **API Documentation**

### **Authentication Routes**

#### **Register User**

- **Endpoint:** `POST /api/auth/register`
- **Request Body:**

```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "string" // optional
}
```

- **Response:**

```json
{
  "message": "User registered successfully"
}
```

#### **Login User**

- **Endpoint:** `POST /api/auth/login`
- **Request Body:**

```json
{
  "email": "string",
  "password": "string"
}
```

- **Response:**

```json
{
  "token": "string"
}
```

#### **Activate Email**

- **Endpoint:** `POST /api/auth/activate`
- **Request Body:**

```json
{
  "activationToken": "string"
}
```

- **Response:**

```json
{
  "message": "Email activated successfully"
}
```

#### **Get Current User**

- **Endpoint:** `GET /api/auth/me`
- **Headers:**

```bash
Authorization: Bearer <token>
```

- **Response:**

```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "role": "string"
}
```

### **User Routes**

#### **Get All Users**

- **Endpoint:** `GET /api/users`
- **Headers:**

```bash
Authorization: Bearer <token>
```

- **Response:**

```json
[
  {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "string"
  }
]
```

#### **Get User by ID**

- **Endpoint:** `GET /api/users/:id`
- **Response:**

```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "role": "string"
}
```

#### **Update User**

- **Endpoint:** `PUT /api/users/:id`
- **Request Body:**

```json
{
  "username": "string",
  "email": "string",
  "role": "string"
}
```

- **Response:**

```json
{
  "message": "User updated successfully"
}
```

#### **Delete User**

- **Endpoint:** `DELETE /api/users/:id`
- **Response:**

```json
{
  "message": "User deleted successfully"
}
```

### **Problem Routes**

#### **Create Problem**

- **Endpoint:** `POST /api/problems`
- **Request Body:**

```json
{
  "title": "string",
  "description": "string"
}
```

- **Response:**

```json
{
  "message": "Problem created successfully"
}
```

#### **Get All Problems**

- **Endpoint:** `GET /api/problems`
- **Response:**

```json
[
  {
    "id": "string",
    "title": "string",
    "description": "string"
  }
]
```

#### **Get Problem by ID**

- **Endpoint:** `GET /api/problems/:id`
- **Response:**

```json
{
  "id": "string",
  "title": "string",
  "description": "string"
}
```

#### **Update Problem**

- **Endpoint:** `PUT /api/problems/:id`
- **Request Body:**

```json
{
  "title": "string",
  "description": "string"
}
```

- **Response:**

```json
{
  "message": "Problem updated successfully"
}
```

#### **Delete Problem**

- **Endpoint:** `DELETE /api/problems/:id`
- **Response:**

```json
{
  "message": "Problem deleted successfully"
}
```

### **Workshop Routes**

#### **Create Workshop**

- **Endpoint:** `POST /api/workshops`
- **Request Body:**

```json
{
  "name": "string",
  "description": "string",
  "contactInfo": "string",
  "address": "string",
  "mapLocation": "string"
}
```

- **Response:**

```json
{
  "message": "Workshop created successfully"
}
```

#### **Get All Workshops**

- **Endpoint:** `GET /api/workshops`
- **Response:**

```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string"
  }
]
```

#### **Get Workshop by ID**

- **Endpoint:** `GET /api/workshops/:id`
- **Response:**

```json
{
  "id": "string",
  "name": "string",
  "description": "string"
}
```

#### **Update Workshop**

- **Endpoint:** `PUT /api/workshops/:id`
- **Request Body:**

```json
{
  "name": "string",
  "description": "string",
  "contactInfo": "string",
  "address": "string",
  "mapLocation": "string"
}
```

- **Response:**

```json
{
  "message": "Workshop updated successfully"
}
```

#### **Delete Workshop**

- **Endpoint:** `DELETE /api/workshops/:id`
- **Response:**

```json
{
  "message": "Workshop deleted successfully"
}
```

### **Deal Routes**

#### **Create Deal**

- **Endpoint:** `POST /api/deals`
- **Request Body:**

```json
{
  "problemId": "string",
  "documentId": "string",
  "offerId": "string",
  "customerId": "string",
  "moderatorId": "string",
  "workshopId": "string"
}
```

- **Response:**

```json
{
  "message": "Deal created successfully"
}
```

#### **Get All Deals**

- **Endpoint:** `GET /api/deals`
- **Response:**

```json
[
  {
    "id": "string",
    "problemId": "string",
    "offerId": "string",
    "customerId": "string"
  }
]
```

#### **Get Deal by ID**

- **Endpoint:** `GET /api/deals/:id`
- **Response:**

```json
{
  "id": "string",
  "problemId": "string",
  "offerId": "string",
  "customerId": "string"
}
```

#### **Update Deal**

- **Endpoint:** `PUT /api/deals/:id`
- **Request Body:**

```json
{
  "offerId": "string"
}
```

- **Response:**

```json
{
  "message": "Deal updated successfully"


}
```

#### **Delete Deal**

- **Endpoint:** `DELETE /api/deals/:id`
- **Response:**

```json
{
  "message": "Deal deleted successfully"
}
```

### **Document Routes**

#### **Create Document**

- **Endpoint:** `POST /api/documents`
- **Request Body:**

```json
{
  "problemId": "string",
  "description": "string"
}
```

- **Response:**

```json
{
  "message": "Document created successfully"
}
```

#### **Get All Documents**

- **Endpoint:** `GET /api/documents`
- **Response:**

```json
[
  {
    "id": "string",
    "problemId": "string",
    "description": "string"
  }
]
```

#### **Get Document by ID**

- **Endpoint:** `GET /api/documents/:id`
- **Response:**

```json
{
  "id": "string",
  "problemId": "string",
  "description": "string"
}
```

#### **Update Document**

- **Endpoint:** `PUT /api/documents/:id`
- **Request Body:**

```json
{
  "description": "string"
}
```

- **Response:**

```json
{
  "message": "Document updated successfully"
}
```

#### **Delete Document**

- **Endpoint:** `DELETE /api/documents/:id`
- **Response:**

```json
{
  "message": "Document deleted successfully"
}
```

### **Offer Routes**

#### **Create Offer**

- **Endpoint:** `POST /api/offers`
- **Request Body:**

```json
{
  "workshopId": "string",
  "problemId": "string",
  "details": "string",
  "price": "number"
}
```

- **Response:**

```json
{
  "message": "Offer created successfully"
}
```

#### **Get All Offers**

- **Endpoint:** `GET /api/offers`
- **Response:**

```json
[
  {
    "id": "string",
    "workshopId": "string",
    "problemId": "string",
    "details": "string"
  }
]
```

#### **Get Offer by ID**

- **Endpoint:** `GET /api/offers/:id`
- **Response:**

```json
{
  "id": "string",
  "workshopId": "string",
  "problemId": "string",
  "details": "string"
}
```

#### **Update Offer**

- **Endpoint:** `PUT /api/offers/:id`
- **Request Body:**

```json
{
  "details": "string",
  "price": "number"
}
```

- **Response:**

```json
{
  "message": "Offer updated successfully"
}
```

#### **Delete Offer**

- **Endpoint:** `DELETE /api/offers/:id`
- **Response:**

```json
{
  "message": "Offer deleted successfully"
}
```

## **Usage Examples**

### **Example: Registering a User**

```bash
curl -X POST http://localhost:5000/api/auth/register \
-H "Content-Type: application/json" \
-d '{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}'
```

### **Example: Logging In**

```bash
curl -X POST http://localhost:5000/api/auth/login \
-H "Content-Type: application/json" \
-d '{
  "email": "test@example.com",
  "password": "password123"
}'
```

### **Example: Creating a Problem**

```bash
curl -X POST http://localhost:5000/api/problems \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <token>" \
-d '{
  "title": "Leaking Faucet",
  "description": "The faucet in the kitchen is leaking."
}'
```

## **Contributing**

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Make your changes and commit them (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Create a new Pull Request.
