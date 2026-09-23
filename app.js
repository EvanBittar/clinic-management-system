require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
const clinicsRouter = require('./routes/clinics');
const userRouter = require('./routes/users');
const departmentRouter = require('./routes/departments');

app.use('/', authRoutes);
app.use('/clinics', clinicsRouter);
app.use('/users' , userRouter);
app.use('/department' , departmentRouter);

module.exports = app;