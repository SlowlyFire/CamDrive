const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  label: { type: String, required: true },
  value: { type: String, enum: ['ok', 'not_ok', null], default: null },
}, { _id: false });

const damageRowSchema = new mongoose.Schema({
  location:    { type: String, default: '' },
  description: { type: String, default: '' },
}, { _id: false });

const inspectionFormSchema = new mongoose.Schema({
  inspectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inspection',
    required: true,
    unique: true,
  },
  formType: { type: String, enum: ['enlistment', 'release'], required: true },
  header: {
    serialNumber:            { type: String, default: '' },
    enlistmentDate:          { type: String, default: '' },
    time:                    { type: String, default: '' },
    internalNumber:          { type: String, default: '' },
    equipmentNumberAndModel: { type: String, default: '' },
    vehicleType:             { type: String, default: '' },
    engineHours:             { type: String, default: '' },
    yearModel:               { type: String, default: '' },
    securitySystemCode:      { type: String, default: '' },
    ownerName:               { type: String, default: '' },
    driverFullName:          { type: String, default: '' },
    phoneNumber:             { type: String, default: '' },
    operatorMobileNumber:    { type: String, default: '' },
    enlistmentSiteName:      { type: String, default: '' },
    creditSiteName:          { type: String, default: '' },
    releaseSiteName:         { type: String, default: '' },
    yatzamPhone:             { type: String, default: '' },
  },
  fuelGauge: {
    liters: { type: Number, default: null },
    level:  { type: String, enum: ['E', '1/4', '1/2', '3/4', 'F', null], default: null },
  },
  sections: {
    documents:       { type: [itemSchema], default: [] },
    operatorCabin:   { type: [itemSchema], default: [] },
    engineCheck:     { type: [itemSchema], default: [] },
    steeringSystem:  { type: [itemSchema], default: [] },
    hydraulicSystem: { type: [itemSchema], default: [] },
    brakes:          { type: [itemSchema], default: [] },
    wheelSteering:   { type: [itemSchema], default: [] },
    trackSystem:     { type: [itemSchema], default: [] },
    gearSystem:      { type: [itemSchema], default: [] },
    tires:           { type: [itemSchema], default: [] },
    workTest:        { type: [itemSchema], default: [] },
    levels:          { type: [itemSchema], default: [] },
    compactor:       { type: [itemSchema], default: [] },
    scarifier:       { type: [itemSchema], default: [] },
  },
  damageTable: { type: [damageRowSchema], default: [] },
  status:      { type: String, enum: ['draft', 'submitted'], default: 'draft' },
  lastSavedAt: { type: Date, default: null },
});

module.exports = mongoose.model('InspectionForm', inspectionFormSchema);
