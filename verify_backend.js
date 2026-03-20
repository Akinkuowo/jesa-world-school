const axios = require('axios');

async function test() {
    const API_URL = 'http://localhost:4000/api';
    const timestamp = Date.now(); // Make emails unique each run

    try {
        // 1. Super Admin Login
        console.log('--- Logging in as Super Admin ---');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'superadmin@jesa.com',
            password: 'password123',
            role: 'SUPERADMIN'
        });
        const token = loginRes.data.token;
        console.log('Login successful, token received.');

        // 2. Create a School
        console.log('\n--- Creating a School ---');
        const schoolRes = await axios.post(`${API_URL}/superadmin/schools`, {
            name: 'St. Mary High',
            address: '123 Lagos St',
            phone: '08012345678',
            email: `stmary-${timestamp}@example.com`,
            maxStudents: 50,
            maxTeachers: 5,
            adminEmail: `admin-${timestamp}@stmary.com`,
            adminPassword: 'password456',
            adminFirstName: 'John',
            adminLastName: 'Doe'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('School created:', schoolRes.data.name);
        console.log('School Number:', schoolRes.data.schoolNumber);

        // 3. Test multi-tenant Login for the new School Admin
        console.log('\n--- Logging in as School Admin ---');
        const schoolLoginRes = await axios.post(`${API_URL}/auth/login`, {
            email: `admin-${timestamp}@stmary.com`,
            password: 'password456',
            schoolNumber: schoolRes.data.schoolNumber,
            role: 'ADMIN'
        });
        console.log('School Admin login successful for school:', schoolLoginRes.data.user.schoolName);
        const adminToken = schoolLoginRes.data.token;

        // 4. Test Add Teacher
        console.log('\n--- Adding a Teacher ---');
        const teacherRes = await axios.post(`${API_URL}/admin/users`, {
            email: `teacher1-${timestamp}@stmary.com`,
            password: 'password789',
            firstName: 'Jane',
            lastName: 'Smith',
            role: 'TEACHER'
        }, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log('Teacher added:', teacherRes.data.email);

        // 5. Test Get Stats
        console.log('\n--- Fetching Admin Stats ---');
        const statsRes = await axios.get(`${API_URL}/admin/stats`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log('Stats:', statsRes.data);

        // 6. Test List Teachers
        console.log('\n--- Listing Teachers ---');
        const teachersRes = await axios.get(`${API_URL}/admin/users/TEACHER`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log('Teachers found:', teachersRes.data.length);

        // 7. Cleanup: Delete School (Testing the new DELETE route)
        console.log('\n--- Deleting the School ---');
        const deleteRes = await axios.delete(`${API_URL}/superadmin/schools/${schoolRes.data.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Delete result:', deleteRes.data.message);

    } catch (err) {
        console.error('Test failed:', err.response?.data || err.message);
    }
}

test();
