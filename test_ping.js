const testAuth = async () => {
    try {
        const response = await fetch("https://fixmate-production.up.railway.app/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: "Node Testing",
                email: `test_user_${Date.now()}@real.com`,
                password: "password123",
                role: "USER"
            })
        });

        const data = await response.text();
        console.log("STATUS:", response.status);
        console.log("RESPONSE:", data);
    } catch (e) {
        console.log("FATAL ERROR:", e);
    }
}

testAuth();
