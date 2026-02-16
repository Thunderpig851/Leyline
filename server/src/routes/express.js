require('dotenv').config();
const express = require('express');
const { connectToMongoDB } = require('../database/mongo');

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(express.json());