const axios = require('axios');

async function testAIChat() {
    try {
        const response = await axios.post('http://localhost:4000/api/teacher/ai/chat', {
            message: "Analyze the theme of 'The Gods are not to Blame'"
        }, {
            headers: {
                // No token for now, just to see if it reaches the server
                'Content-Type': 'application/json'
            }
        });
        console.log("Response:", response.data);
    } catch (error) {
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        } else {
            console.error("Error:", error.message);
        }
    }
}

testAIChat();
