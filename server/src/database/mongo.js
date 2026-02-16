require('dotenv').config();
const mongoose = require('mongoose');

async function connectToMongoDB() 
{
  try 
  {
    await mongoose.connect(process.env.MONGO_URI, 
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } 
  catch (error) 
  {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

module.exports = connectToMongoDB;