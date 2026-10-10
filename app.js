require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
const clinicsRoutes = require('./routes/clinics');
const clinicTypesRoutes = require('./routes/clinicTypes');
const usersRoutes = require('./routes/users');
const departmentsRoutes = require('./routes/departments');
const doctorsRoutes = require('./routes/doctors');
const appointmentTypesRoutes = require('./routes/appointmentTypes');
const patientsRoutes = require('./routes/patients');
const appointmentsRoutes = require('./routes/appointments');
const notificationsRoutes = require('./routes/notifications');

app.use('/api/clinics', clinicsRoutes);
app.use('/api/clinic-types', clinicTypesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/appointment-types', appointmentTypesRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/', authRoutes);

module.exports = app;