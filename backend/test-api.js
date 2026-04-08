async function test() {
  try {
    const res = await fetch('http://localhost:5000/api/chats/6620ca101111111111111111'); // fake id
    console.log(res.status);
    console.error(err);
    process.exit(1);
  }
}
test();
