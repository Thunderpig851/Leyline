require('dotenv').config();
const express = require('express');
const { connectToMongoDB } = require('../database/mongo');

const app = express();

// Middleware
app.use(express.json());

