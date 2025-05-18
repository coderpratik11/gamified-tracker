const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
    readUsers,
    writeUsers,
    readWorkData,
    writeWorkData
} = require('./helper/google-sheets-helper');

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Task definitions
const TASK_DEFINITIONS = {
    "Cooking": { points: 10, category: "Food" },
    "Washing utensils": { points: 3, category: "Washing utensils" },
    "Cleaning floor with broom": { points: 3, category: "Cleaning room with broom" },
    "Cleaning floor with mob": { points: 5, category: "Clean the room using mob" },
    "Cleaning the toilet": { points: 8, category: "Cleaning the toilet" }
};

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password are required." });

    try {
        const users = await readUsers();
        const user = users.find(u => u.userName === username);

        if (user && user.passwordHash && await bcrypt.compare(password, user.passwordHash)) {
            const { passwordHash, ...safeUser } = user;
            res.json({ message: "Login successful", user: safeUser });
        } else {
            res.status(401).json({ message: "Invalid username or password." });
        }
    } catch (err) {
        res.status(500).json({ message: "Error logging in.", error: err.message });
    }
});

// --- CHANGE PASSWORD ---
app.put('/api/users/password', async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) {
        return res.status(400).json({ message: "User ID, old password, and new password are required." });
    }

    try {
        let users = await readUsers();
        const index = users.findIndex(u => u.userId == userId);
        if (index === -1) return res.status(404).json({ message: "User not found." });

        if (!await bcrypt.compare(oldPassword, users[index].passwordHash)) {
            return res.status(401).json({ message: "Incorrect old password." });
        }

        users[index].passwordHash = await bcrypt.hash(newPassword, saltRounds);
        await writeUsers(users);
        res.json({ message: "Password updated successfully." });

    } catch (err) {
        res.status(500).json({ message: "Error updating password.", error: err.message });
    }
});

// --- UPDATE GIPHY ---
app.put('/api/users/profile/giphy', async (req, res) => {
    const { userId, giphyLink } = req.body;
    if (!userId) return res.status(400).json({ message: "User ID required." });

    try {
        let users = await readUsers();
        const index = users.findIndex(u => u.userId == userId);
        if (index === -1) return res.status(404).json({ message: "User not found." });

        users[index].giphyLink = giphyLink;
        await writeUsers(users);
        const { passwordHash, ...safeUser } = users[index];
        res.json({ message: "Giphy updated.", user: safeUser });

    } catch (err) {
        res.status(500).json({ message: "Error updating Giphy.", error: err.message });
    }
});

// --- GET WORK DATA ---
app.get('/api/workdata', async (req, res) => {
    try {
        const workData = await readWorkData();
        res.json(workData);
    } catch (err) {
        res.status(500).json({ message: "Error reading work data.", error: err.message });
    }
});

// --- ADD WORK DATA ---
app.post('/api/workdata', async (req, res) => {
    const { workType, dateOfWork, submitterUserId, submitterUserName, notes } = req.body;
    if (!workType || !dateOfWork || !submitterUserId || !submitterUserName) {
        return res.status(400).json({ message: "Missing fields." });
    }

    const task = TASK_DEFINITIONS[workType];
    if (!task) return res.status(400).json({ message: "Invalid work type." });

    const newEntry = {
        entryId: uuidv4(),
        workType,
        points: task.points,
        approvalStatus: "Not approved",
        month: dateOfWork.slice(0, 7),
        dateOfWork,
        submitterUserId,
        submitterUserName,
        approver1UserId: "",
        approver1UserName: "",
        approver2UserId: "",
        approver2UserName: "",
        notes: notes || ""
    };

    try {
        const workData = await readWorkData();
        workData.push(newEntry);
        await writeWorkData(workData);
        res.status(201).json({ message: "Entry added.", entry: newEntry });
    } catch (err) {
        res.status(500).json({ message: "Error writing entry.", error: err.message });
    }
});

// --- APPROVE WORK ENTRY ---
app.put('/api/workdata/:entryId/approve', async (req, res) => {
    const { entryId } = req.params;
    const { approverUserId, approverUserName } = req.body;
    if (!approverUserId || !approverUserName) return res.status(400).json({ message: "Approver required." });

    try {
        let workData = await readWorkData();
        const index = workData.findIndex(e => e.entryId === entryId);
        if (index === -1) return res.status(404).json({ message: "Entry not found." });

        const entry = workData[index];
        if (entry.submitterUserId === approverUserId ||
            entry.approver1UserId === approverUserId ||
            entry.approver2UserId === approverUserId) {
            return res.status(403).json({ message: "You cannot approve this entry." });
        }

        if (entry.approvalStatus === "Approved") {
            return res.status(400).json({ message: "Already approved." });
        }

        if (!entry.approver1UserId) {
            entry.approver1UserId = approverUserId;
            entry.approver1UserName = approverUserName;
            entry.approvalStatus = "Partially Approved";
        } else if (!entry.approver2UserId) {
            entry.approver2UserId = approverUserId;
            entry.approver2UserName = approverUserName;
            entry.approvalStatus = "Approved";
        } else {
            return res.status(400).json({ message: "Already approved by two users." });
        }

        workData[index] = entry;
        await writeWorkData(workData);
        res.json({ message: "Approved", entry });

    } catch (err) {
        res.status(500).json({ message: "Error approving entry.", error: err.message });
    }
});

// --- REJECT WORK ENTRY ---
app.put('/api/workdata/:entryId/reject', async (req, res) => {
    const { entryId } = req.params;
    try {
        let workData = await readWorkData();
        const index = workData.findIndex(e => e.entryId === entryId);
        if (index === -1) return res.status(404).json({ message: "Entry not found." });

        workData[index].approvalStatus = "Rejected";
        await writeWorkData(workData);
        res.json({ message: "Rejected." });

    } catch (err) {
        res.status(500).json({ message: "Error rejecting entry.", error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
