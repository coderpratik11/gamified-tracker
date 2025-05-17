const express = require('express');
const Papa = require('papaparse');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10; // For bcrypt

const USERS_FILE_PATH = path.join(__dirname, 'data', 'users.csv');
const WORK_DATA_FILE_PATH = path.join(__dirname, 'data', 'work_data.csv');

// --- Middleware ---
app.use(express.json()); // For parsing application/json
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public'

// --- CSV Helper Functions ---
async function readCSV(filePath) {
    try {
        await fs.access(filePath); // Check if file exists
        const csvFile = await fs.readFile(filePath, 'utf8');
        return Papa.parse(csvFile, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
    } catch (error) {
        if (error.code === 'ENOENT') { // File does not exist
            if (filePath === USERS_FILE_PATH) {
                console.warn('users.csv not found. Returning empty array.');
                return []; // Or create with headers? For now, empty.
            } else if (filePath === WORK_DATA_FILE_PATH) {
                console.warn('work_data.csv not found. Returning empty array.');
                return [];
            }
        }
        console.error(`Error reading CSV file ${filePath}:`, error);
        throw error; // Re-throw to be caught by endpoint handler
    }
}

async function writeCSV(filePath, data) {
    const csvData = Papa.unparse(data);
    await fs.writeFile(filePath, csvData, 'utf8');
}

// --- Task Definitions --- (as per previous discussions)
const TASK_DEFINITIONS = {
    "Cooking": { points: 10, category: "Food" },
    "Washing utensils": { points: 3, category: "Washing utensils" },
    "Cleaning floor with broom": { points: 3, category: "Cleaning room with broom" },
    "Cleaning floor with mob": { points: 5, category: "Clean the room using mob" },
    "Cleaning the toilet": { points: 8, category: "Cleaning the toilet" }
};


// --- API Endpoints ---

// User Authentication
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }
    try {
        const users = await readCSV(USERS_FILE_PATH);
        const user = users.find(u => u.userName === username);

        if (user && user.passwordHash && await bcrypt.compare(password, user.passwordHash)) {
            // Send user data except passwordHash
            const { passwordHash, ...userToSend } = user;
            res.json({ message: "Login successful", user: userToSend });
        } else {
            res.status(401).json({ message: "Invalid username or password." });
        }
    } catch (error) {
        res.status(500).json({ message: "Error logging in.", error: error.message });
    }
});

app.put('/api/users/password', async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) {
        return res.status(400).json({ message: "User ID, old password, and new password are required." });
    }

    try {
        let users = await readCSV(USERS_FILE_PATH);
        const userIndex = users.findIndex(u => u.userId == userId); // Use == for potential string/number comparison from CSV

        if (userIndex === -1) {
            return res.status(404).json({ message: "User not found." });
        }

        const user = users[userIndex];
        if (!user.passwordHash || !(await bcrypt.compare(oldPassword, user.passwordHash))) {
            return res.status(401).json({ message: "Incorrect old password." });
        }

        users[userIndex].passwordHash = await bcrypt.hash(newPassword, saltRounds);
        await writeCSV(USERS_FILE_PATH, users);
        res.json({ message: "Password updated successfully." });
    } catch (error) {
        res.status(500).json({ message: "Error updating password.", error: error.message });
    }
});

app.put('/api/users/profile/giphy', async (req, res) => {
    const { userId, giphyLink } = req.body;
    if (!userId || giphyLink === undefined) { // Allow empty string for removing Giphy
        return res.status(400).json({ message: "User ID and Giphy link are required." });
    }
    try {
        let users = await readCSV(USERS_FILE_PATH);
        const userIndex = users.findIndex(u => u.userId == userId);
        if (userIndex === -1) {
            return res.status(404).json({ message: "User not found." });
        }
        users[userIndex].giphyLink = giphyLink;
        await writeCSV(USERS_FILE_PATH, users);
        // Send back the updated user (excluding hash)
        const { passwordHash, ...updatedUser } = users[userIndex];
        res.json({ message: "Giphy link updated successfully.", user: updatedUser });
    } catch (error) {
        res.status(500).json({ message: "Error updating Giphy link.", error: error.message });
    }
});


// Work Data Endpoints
app.get('/api/workdata', async (req, res) => {
    try {
        const workData = await readCSV(WORK_DATA_FILE_PATH);
        res.json(workData);
    } catch (error) {
        res.status(500).json({ message: "Error fetching work data.", error: error.message });
    }
});

app.post('/api/workdata', async (req, res) => {
    const { workType, dateOfWork, submitterUserId, submitterUserName, notes } = req.body;

    if (!workType || !dateOfWork || !submitterUserId || !submitterUserName) {
        return res.status(400).json({ message: "Missing required fields for work entry." });
    }

    const taskDefinition = TASK_DEFINITIONS[workType];
    if (!taskDefinition) {
        return res.status(400).json({ message: "Invalid work type." });
    }

    const newEntry = {
        entryId: uuidv4(),
        workType: workType,
        points: taskDefinition.points,
        approvalStatus: "Not approved",
        month: dateOfWork.slice(0, 7), // YYYY-MM
        dateOfWork: dateOfWork,
        submitterUserId: submitterUserId,
        submitterUserName: submitterUserName,
        approver1UserId: "",
        approver1UserName: "",
        approver2UserId: "",
        approver2UserName: "",
        notes: notes || ""
    };

    try {
        let workData = await readCSV(WORK_DATA_FILE_PATH);
        workData.push(newEntry);
        await writeCSV(WORK_DATA_FILE_PATH, workData);
        res.status(201).json({ message: "Work entry added successfully.", entry: newEntry });
    } catch (error) {
        res.status(500).json({ message: "Error adding work entry.", error: error.message });
    }
});

app.put('/api/workdata/:entryId/approve', async (req, res) => {
    const { entryId } = req.params;
    const { approverUserId, approverUserName } = req.body; // User performing the approval

    if (!approverUserId || !approverUserName) {
        return res.status(400).json({ message: "Approver information is required." });
    }

    try {
        let workData = await readCSV(WORK_DATA_FILE_PATH);
        const entryIndex = workData.findIndex(e => e.entryId === entryId);

        if (entryIndex === -1) {
            return res.status(404).json({ message: "Work entry not found." });
        }

        let entry = workData[entryIndex];

        if (entry.submitterUserId == approverUserId) {
            return res.status(403).json({ message: "You cannot approve your own task." });
        }
        if (entry.approver1UserId == approverUserId || entry.approver2UserId == approverUserId) {
            return res.status(403).json({ message: "You have already approved this task." });
        }
        if (entry.approvalStatus === "Approved") {
             return res.status(400).json({ message: "Task is already fully approved." });
        }


        if (!entry.approver1UserId) {
            entry.approver1UserId = approverUserId;
            entry.approver1UserName = approverUserName;
            entry.approvalStatus = "Partially Approved";
        } else if (!entry.approver2UserId) {
            entry.approver2UserId = approverUserId;
            entry.approver2UserName = approverUserName;
            entry.approvalStatus = "Approved"; // Now fully approved
        } else {
            // This case should ideally not be reached if status check above is correct
            return res.status(400).json({ message: "Task already has two approvers." });
        }

        workData[entryIndex] = entry;
        await writeCSV(WORK_DATA_FILE_PATH, workData);
        res.json({ message: "Task approval updated.", entry });

    } catch (error) {
        console.error("Approval error:", error);
        res.status(500).json({ message: "Error approving task.", error: error.message });
    }
});

app.put('/api/workdata/:entryId/reject', async (req, res) => {
    const { entryId } = req.params;
    // const { rejectorUserId, rejectorUserName } = req.body; // Optional: log who rejected

    try {
        let workData = await readCSV(WORK_DATA_FILE_PATH);
        const entryIndex = workData.findIndex(e => e.entryId === entryId);

        if (entryIndex === -1) {
            return res.status(404).json({ message: "Work entry not found." });
        }

        // Option 1: Mark as Rejected
        workData[entryIndex].approvalStatus = "Rejected";
        // Option 2: Remove the entry (as per original harder prompt)
        // workData.splice(entryIndex, 1);

        await writeCSV(WORK_DATA_FILE_PATH, workData);
        res.json({ message: "Task rejected successfully.", entry: workData[entryIndex] }); // or just a success message if removed
    } catch (error) {
        res.status(500).json({ message: "Error rejecting task.", error: error.message });
    }
});

app.put('/api/workdata/:entryId', async (req, res) => {
    const { entryId } = req.params;
    const { workType, dateOfWork, notes, editorUserId } = req.body; // editorUserId for permission check

    if (!workType || !dateOfWork ) {
        return res.status(400).json({ message: "Work type and date are required for editing." });
    }
     const taskDefinition = TASK_DEFINITIONS[workType];
    if (!taskDefinition) {
        return res.status(400).json({ message: "Invalid work type." });
    }

    try {
        let workData = await readCSV(WORK_DATA_FILE_PATH);
        const entryIndex = workData.findIndex(e => e.entryId === entryId);

        if (entryIndex === -1) {
            return res.status(404).json({ message: "Work entry not found." });
        }
        let entry = workData[entryIndex];

        // Permission check: Only submitter can edit if "Not approved" or "Partially Approved"
        if (entry.submitterUserId != editorUserId || !["Not approved", "Partially Approved"].includes(entry.approvalStatus)) {
            return res.status(403).json({ message: "You do not have permission to edit this task or it cannot be edited in its current state." });
        }

        entry.workType = workType;
        entry.points = taskDefinition.points;
        entry.dateOfWork = dateOfWork;
        entry.month = dateOfWork.slice(0, 7);
        entry.notes = notes || entry.notes;
        // IMPORTANT: Editing resets approvals because the task details changed.
        entry.approvalStatus = "Not approved";
        entry.approver1UserId = "";
        entry.approver1UserName = "";
        entry.approver2UserId = "";
        entry.approver2UserName = "";


        workData[entryIndex] = entry;
        await writeCSV(WORK_DATA_FILE_PATH, workData);
        res.json({ message: "Task updated successfully. Approvals have been reset.", entry });
    } catch (error) {
        res.status(500).json({ message: "Error updating task.", error: error.message });
    }
});

app.delete('/api/workdata/:entryId', async (req, res) => {
    const { entryId } = req.params;
    const { deleterUserId } = req.body; // User attempting the delete

    try {
        let workData = await readCSV(WORK_DATA_FILE_PATH);
        const entryIndex = workData.findIndex(e => e.entryId === entryId);

        if (entryIndex === -1) {
            return res.status(404).json({ message: "Work entry not found." });
        }
        const entry = workData[entryIndex];

        // Permission: Only submitter can delete if status is "Not approved" or "Partially Approved"
        if (entry.submitterUserId != deleterUserId || !["Not approved", "Partially Approved"].includes(entry.approvalStatus)) {
             return res.status(403).json({ message: "You do not have permission to delete this task or it cannot be deleted in its current state." });
        }

        workData.splice(entryIndex, 1); // Remove the entry
        await writeCSV(WORK_DATA_FILE_PATH, workData);
        res.json({ message: "Task deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: "Error deleting task.", error: error.message });
    }
});


// Fallback for SPA - if you use client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    // Check if CSV files exist, create with headers if not (optional)
    (async () => {
        try {
            await fs.access(USERS_FILE_PATH);
        } catch (e) {
            console.log("users.csv not found, creating with headers...");
            await fs.writeFile(USERS_FILE_PATH, "userId,userName,giphyLink,passwordHash\n", 'utf8');
        }
        try {
            await fs.access(WORK_DATA_FILE_PATH);
        } catch (e) {
            console.log("work_data.csv not found, creating with headers...");
            await fs.writeFile(WORK_DATA_FILE_PATH, "entryId,workType,points,approvalStatus,month,dateOfWork,submitterUserId,submitterUserName,approver1UserId,approver1UserName,approver2UserId,approver2UserName,notes\n", 'utf8');
        }
    })();
});