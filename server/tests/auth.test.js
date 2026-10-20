import request from 'supertest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';

dotenv.config();

describe('Auth REST Routes Integration Tests', () => {
  const timestamp = Date.now();
  const testUser = {
    name: 'Jest Tester',
    email: `jest_test_${timestamp}@example.com`,
    password: 'securepassword123',
  };

  let authToken = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
  });

  afterAll(async () => {
    // Clean up test user
    if (testUser.email) {
      await User.deleteOne({ email: testUser.email });
    }
    await mongoose.connection.close();
  });

  test('POST /api/auth/register - Rejects registration with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bad@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test('POST /api/auth/register - Rejects registration with short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Short Pass', email: 'short@test.com', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test('POST /api/auth/register - Successfully registers a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    authToken = res.body.token;
  });

  test('POST /api/auth/register - Prevents duplicate email registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already exists');
  });

  test('POST /api/auth/login - Rejects incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBeDefined();
  });

  test('POST /api/auth/login - Successfully logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  test('GET /api/auth/me - Rejects unauthorized requests without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBeDefined();
  });

  test('GET /api/auth/me - Successfully returns profile for authenticated user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(testUser.email);
  });
});
