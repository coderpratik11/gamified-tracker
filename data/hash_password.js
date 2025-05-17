const bcrypt = require('bcrypt');
const saltRounds = 10;
const plainPassword = 'Suraj'; // Change this for each user

bcrypt.hash(plainPassword, saltRounds, function(err, hash) {
    if (err) {
        console.error("Error hashing password:", err);
        return;
    }
    console.log(`Plain: ${plainPassword}`);
    console.log(`Hash: ${hash}`);
});