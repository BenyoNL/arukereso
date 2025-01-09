exports.handler = async (event) => {
  const password = "Merkapt2025";
  const { password: providedPassword } = JSON.parse(event.body);

  if (providedPassword === password) {
    return {
      statusCode: 200,
      body: JSON.stringify({ authenticated: true, message: "Authentication successful!" }),
    };
  } else {
    return {
      statusCode: 401,
      body: JSON.stringify({ authenticated: false, message: "Invalid password!" }),
    };
  }
};
