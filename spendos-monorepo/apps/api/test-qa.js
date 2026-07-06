const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const API_URL = 'http://localhost:3000';

async function runTests() {
  const log = (msg) => console.log(`[TEST] ${msg}`);
  const error = (msg) => console.error(`[ERROR] ${msg}`);

  let bcToken, adminToken, managerToken, employeeToken;
  let companyId;
  let managerId, employeeId;
  
  const timestamp = Date.now();
  const emailDomain = `test${timestamp}.com`;

  try {
    // 1. Register Black Card
    log('Registering Black Card user...');
    const regRes = await axios.post(`${API_URL}/auth/register`, {
      companyName: `Test Company ${timestamp}`,
      emailDomain: emailDomain,
      fullName: 'Black Card User',
      email: `bc@${emailDomain}`,
      password: 'Password123!',
    });
    bcToken = regRes.data.accessToken;
    companyId = regRes.data.companyId;
    log('Black Card registered.');

    // 2. Create Admin, Manager, Employee directly
    log('Creating Admin...');
    const adminRes = await axios.post(`${API_URL}/users/invite`, {
      email: `admin@${emailDomain}`,
      role: 'admin',
      defaultPassword: 'Password123!',
      fullName: 'Admin User'
    }, { headers: { Authorization: `Bearer ${bcToken}` } });
    
    log('Creating Manager...');
    const mgrRes = await axios.post(`${API_URL}/users/invite`, {
      email: `manager@${emailDomain}`,
      role: 'manager',
      defaultPassword: 'Password123!',
      fullName: 'Manager User'
    }, { headers: { Authorization: `Bearer ${bcToken}` } });

    log('Creating Employee...');
    const empRes = await axios.post(`${API_URL}/users/invite`, {
      email: `employee@${emailDomain}`,
      role: 'employee',
      defaultPassword: 'Password123!',
      fullName: 'Employee User'
    }, { headers: { Authorization: `Bearer ${bcToken}` } });

    // Login Manager and Employee
    const loginMgr = await axios.post(`${API_URL}/auth/login`, {
      email: `manager@${emailDomain}`,
      password: 'Password123!'
    });
    managerToken = loginMgr.data.accessToken;
    managerId = loginMgr.data.user.id;

    const loginEmp = await axios.post(`${API_URL}/auth/login`, {
      email: `employee@${emailDomain}`,
      password: 'Password123!'
    });
    employeeToken = loginEmp.data.accessToken;
    employeeId = loginEmp.data.user.id;
    
    const loginAdmin = await axios.post(`${API_URL}/auth/login`, {
      email: `admin@${emailDomain}`,
      password: 'Password123!'
    });
    adminToken = loginAdmin.data.accessToken;

    log('All users created and logged in.');

    // Edge Case 1: Self-Approval
    log('Testing Edge Case: Self-Approval');
    const mgrExpRes = await axios.post(`${API_URL}/expenses`, {
      amountPaise: 500000,
      expenseDate: new Date().toISOString(),
      category: 'travel',
      description: 'Manager trip'
    }, { headers: { Authorization: `Bearer ${managerToken}` } });
    const mgrExpId = mgrExpRes.data.id;

    let selfApproveBug = false;
    try {
      await axios.post(`${API_URL}/expenses/${mgrExpId}/approve`, {}, { headers: { Authorization: `Bearer ${managerToken}` } });
      selfApproveBug = true;
      log('BUG CONFIRMED: Manager was able to approve their own expense!');
    } catch (e) {
      log('Self-approval blocked: ' + e.response?.data?.error);
    }

    // Edge Case 2: Unauthorized Document Uploads
    log('Testing Edge Case: Unauthorized Document Upload');
    const empExpRes = await axios.post(`${API_URL}/expenses`, {
      amountPaise: 150000,
      expenseDate: new Date().toISOString(),
      category: 'meals',
      description: 'Employee lunch'
    }, { headers: { Authorization: `Bearer ${employeeToken}` } });
    const empExpId = empExpRes.data.id;

    // Create a dummy file
    const dummyFilePath = path.join(__dirname, 'dummy.png');
    fs.writeFileSync(dummyFilePath, 'dummy content');

    // Test: Upload "proof" without being requested
    let proofUploadBlocked = false;
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(dummyFilePath));
      await axios.post(`${API_URL}/expenses/${empExpId}/documents?type=proof`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${employeeToken}`
        }
      });
      log('BUG: Proof uploaded without being requested!');
    } catch (e) {
      proofUploadBlocked = true;
      log('Proof upload without request blocked (Correct behavior).');
    }

    // Manager requests proof
    await axios.post(`${API_URL}/expenses/${empExpId}/request-proof`, { note: 'Please attach receipt' }, { headers: { Authorization: `Bearer ${managerToken}` } });

    // Upload proof now (should succeed)
    const form2 = new FormData();
    form2.append('file', fs.createReadStream(dummyFilePath));
    await axios.post(`${API_URL}/expenses/${empExpId}/documents?type=proof`, form2, {
      headers: { ...form2.getHeaders(), Authorization: `Bearer ${employeeToken}` }
    });
    log('Proof uploaded successfully after request.');

    // Manager approves
    await axios.post(`${API_URL}/expenses/${empExpId}/approve`, {}, { headers: { Authorization: `Bearer ${managerToken}` } });
    log('Employee expense approved.');

    // Test: Upload "original" document AFTER approval
    let lateOriginalUpload = false;
    try {
      const form3 = new FormData();
      form3.append('file', fs.createReadStream(dummyFilePath));
      await axios.post(`${API_URL}/expenses/${empExpId}/documents?type=original`, form3, {
        headers: { ...form3.getHeaders(), Authorization: `Bearer ${employeeToken}` }
      });
      lateOriginalUpload = true;
      log('BUG CONFIRMED: Employee was able to upload an original document AFTER approval!');
    } catch (e) {
      log('Late original upload blocked: ' + e.response?.data?.error);
    }

    // Edge Case 3: SLA Bypass
    log('Testing Edge Case: SLA Bypass');
    // Employee tries to raise ticket (should fail, SLA is 14 days)
    try {
      await axios.post(`${API_URL}/tickets`, { expenseId: empExpId, note: 'Where is my money?' }, { headers: { Authorization: `Bearer ${employeeToken}` } });
      log('BUG: Ticket raised without SLA expiring!');
    } catch (e) {
      log('Ticket raising before SLA correctly blocked.');
    }

    // Admin sets SLA to -1
    log('Admin setting SLA to -1...');
    await axios.patch(`${API_URL}/company`, { sla_days: -1 }, { headers: { Authorization: `Bearer ${adminToken}` } });
    
    let slaBypassBug = false;
    try {
      await axios.post(`${API_URL}/tickets`, { expenseId: empExpId, note: 'Now where is my money?' }, { headers: { Authorization: `Bearer ${employeeToken}` } });
      slaBypassBug = true;
      log('BUG CONFIRMED: SLA bypassed by setting sla_days to -1!');
    } catch (e) {
      log('SLA bypass failed: ' + e.response?.data?.error);
    }

    // Edge Case 4: Admin setting SLA to 0
    log('Admin setting SLA to 0...');
    await axios.patch(`${API_URL}/company`, { sla_days: 0 }, { headers: { Authorization: `Bearer ${adminToken}` } });
    const companyRes = await axios.get(`${API_URL}/company`, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (companyRes.data.sla_days === -1) {
      log('BUG CONFIRMED: sla_days could not be updated to 0 because of truthiness check (0 is falsy)');
    }

    log('====================================');
    log('TEST RESULTS');
    log('Self-Approval Bug: ' + selfApproveBug);
    log('Unauthorized Proof Document Upload block: ' + proofUploadBlocked);
    log('Post-Approval Original Document Upload Bug: ' + lateOriginalUpload);
    log('SLA Bypass (Negative SLA) Bug: ' + slaBypassBug);
    log('SLA Cannot be 0 Bug: ' + (companyRes.data.sla_days === -1));

  } catch (err) {
    error(err.response?.data?.error || err.message);
  }
}

runTests();
