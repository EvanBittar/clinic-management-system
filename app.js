require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
const clinicsRoutes = require('./routes/clinics');
const usersRoutes = require('./routes/users');
const departmentsRoutes = require('./routes/departments');
const doctorsRoutes = require('./routes/doctors');

app.use('/clinics', clinicsRoutes);
// app.use('/clinic-types', clinicTypesRoutes);
app.use('/users', usersRoutes);
app.use('/departments', departmentsRoutes);
app.use('/doctors', doctorsRoutes);
// app.use('/appointment-types', appointmentTypesRoutes);
// app.use('/patients', patientsRoutes);
// app.use('/appointments', appointmentsRoutes);
// app.use('/notifications', notificationsRoutes);
app.use('/', authRoutes);

module.exports = app;