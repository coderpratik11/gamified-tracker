// --- Global State ---
let loggedInUser = null;
let allWorkData = [];
let allUsersForLeaderboard = []; // Store user data for leaderboard without full details

// --- DOM Elements (Cache them) ---
// Login Section
const loginSection = document.getElementById('loginSection');
const loginForm = document.getElementById('loginForm');
const loginUsernameInput = document.getElementById('loginUsername');
const loginPasswordInput = document.getElementById('loginPassword');
const loginMessage = document.getElementById('loginMessage');

// Main App Interface
const mainAppInterface = document.getElementById('mainAppInterface');
const currentUserGiphy = document.getElementById('currentUserGiphy');
const currentUserNameDisplay = document.getElementById('currentUserNameDisplay');
const logoutButton = document.getElementById('logoutButton');

// Task Form
const taskForm = document.getElementById('taskForm');
const taskWorkTypeSelect = document.getElementById('taskWorkType');
const taskEntryDateInput = document.getElementById('taskEntryDate');
const taskNotesInput = document.getElementById('taskNotes');
const taskFormMessage = document.getElementById('taskFormMessage');

// Tables
const pendingApprovalsTableBody = document.getElementById('pendingApprovalsTable').getElementsByTagName('tbody')[0];
const myTasksTableBody = document.getElementById('myTasksTable').getElementsByTagName('tbody')[0];
const allApprovedTasksTableBody = document.getElementById('allApprovedTasksTable').getElementsByTagName('tbody')[0];
const leaderboardContent = document.getElementById('leaderboardContent');

// Profile Tab
const profileGiphyPreview = document.getElementById('profileGiphyPreview');
const giphyForm = document.getElementById('giphyForm');
const profileGiphyLinkInput = document.getElementById('profileGiphyLink');
const giphyFormMessage = document.getElementById('giphyFormMessage');
const changePasswordForm = document.getElementById('changePasswordForm');
const oldPasswordInput = document.getElementById('oldPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
const passwordFormMessage = document.getElementById('passwordFormMessage');

// Edit Modal
const editModal = document.getElementById('editModal');
const editTaskForm = document.getElementById('editTaskForm');
const editEntryIdInput = document.getElementById('editEntryId');
const editTaskWorkTypeSelect = document.getElementById('editTaskWorkType');
const editTaskEntryDateInput = document.getElementById('editTaskEntryDate');
const editTaskNotesInput = document.getElementById('editTaskNotes');
const editTaskFormMessage = document.getElementById('editTaskFormMessage');

// Filter
const filterMonthYearInput = document.getElementById('filterMonthYear');

// --- API Helper ---
async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(endpoint, options);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        return data;
    } catch (error) {
        console.error(`API request to ${endpoint} failed:`, error);
        throw error; // Re-throw for specific handling
    }
}

// --- Authentication ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsernameInput.value;
    const password = loginPasswordInput.value;
    try {
        const data = await apiRequest('/api/login', 'POST', { username, password });
        loggedInUser = data.user;
        loginSection.classList.remove('active');
        loginSection.classList.add('hidden');
        mainAppInterface.classList.remove('hidden');
        mainAppInterface.classList.add('active');
        loginMessage.textContent = '';
        loginForm.reset();
        await initializeAppData(); // Fetch initial data after login
    } catch (error) {
        loginMessage.textContent = error.message;
        loginMessage.className = 'message error';
    }
});

logoutButton.addEventListener('click', () => {
    loggedInUser = null;
    allWorkData = [];
    allUsersForLeaderboard = [];

    mainAppInterface.classList.remove('active');
    mainAppInterface.classList.add('hidden');
    loginSection.classList.remove('hidden');
    loginSection.classList.add('active');

    // Clear dynamic content
    pendingApprovalsTableBody.innerHTML = '';
    myTasksTableBody.innerHTML = '';
    allApprovedTasksTableBody.innerHTML = '';
    leaderboardContent.innerHTML = '';

    // 🛠️ Fix: Hide the Edit Modal explicitly
    editModal.classList.add('hidden');

    // Optional (Good UX): Reset edit form
    editTaskForm.reset();
    editTaskFormMessage.textContent = '';
});


// --- Data Initialization and Refresh ---
async function initializeAppData() {
    if (!loggedInUser) return;
    currentUserNameDisplay.textContent = loggedInUser.userName;
    currentUserGiphy.src = loggedInUser.giphyLink || 'https://via.placeholder.com/60?text=No+Giphy';
    profileGiphyPreview.src = loggedInUser.giphyLink || 'https://via.placeholder.com/150?text=No+Giphy';
    profileGiphyLinkInput.value = loggedInUser.giphyLink || '';

    // Set default filter month
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    filterMonthYearInput.value = `${year}-${month}`;
    filterMonthYearInput.addEventListener('change', renderAllApprovedTasks);


    await fetchAllWorkData();
    // Fetch all users (minimal data) for leaderboard initially if needed, or derive from workdata submitters
    // For simplicity, we'll derive users for leaderboard from workData submitters and loggedInUser context
    // Or we could add an endpoint /api/users (that doesn't send password hashes)
}

async function fetchAllWorkData() {
    try {
        allWorkData = await apiRequest('/api/workdata');
        // Populate allUsersForLeaderboard for unique users (can be improved with a dedicated /api/users endpoint)
        const usersMap = new Map();
        allWorkData.forEach(task => {
            if (!usersMap.has(task.submitterUserId)) {
                usersMap.set(task.submitterUserId, { userId: task.submitterUserId, userName: task.submitterUserName });
            }
        });
        // Add current logged-in user if not in tasks, and other users from a hypothetical /api/users for complete list
        if (loggedInUser && !usersMap.has(loggedInUser.userId)) {
            usersMap.set(loggedInUser.userId, { userId: loggedInUser.userId, userName: loggedInUser.userName });
        }
        allUsersForLeaderboard = Array.from(usersMap.values());

        refreshAllViews();
    } catch (error) {
        alert(`Error fetching work data: ${error.message}`);
    }
}

function refreshAllViews() {
    if (!loggedInUser) return;
    renderPendingApprovals();
    renderMyTasks();
    renderAllApprovedTasks();
    renderLeaderboard();
}

// --- Task Management ---
taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loggedInUser) return;
    const taskData = {
        workType: taskWorkTypeSelect.value,
        dateOfWork: taskEntryDateInput.value,
        notes: taskNotesInput.value,
        submitterUserId: loggedInUser.userId,
        submitterUserName: loggedInUser.userName,
    };
    try {
        const result = await apiRequest('/api/workdata', 'POST', taskData);
        taskFormMessage.textContent = result.message;
        taskFormMessage.className = 'message success';
        taskForm.reset();
        await fetchAllWorkData(); // Re-fetch all data to update views
    } catch (error) {
        taskFormMessage.textContent = error.message;
        taskFormMessage.className = 'message error';
    }
});

async function approveTask(entryId) {
    if (!loggedInUser) return;
    try {
        await apiRequest(`/api/workdata/${entryId}/approve`, 'PUT', {
            approverUserId: loggedInUser.userId,
            approverUserName: loggedInUser.userName
        });
        await fetchAllWorkData();
    } catch (error) {
        alert(`Error approving task: ${error.message}`);
    }
}

async function rejectTask(entryId) {
    if (!loggedInUser) return;
    if (!confirm("Are you sure you want to reject this task? This will mark it as 'Rejected'.")) return;
    try {
        await apiRequest(`/api/workdata/${entryId}/reject`, 'PUT'); // No body needed for simple rejection
        await fetchAllWorkData();
    } catch (error) {
        alert(`Error rejecting task: ${error.message}`);
    }
}

// --- Profile Management ---
giphyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loggedInUser) return;
    const newGiphyLink = profileGiphyLinkInput.value;
    try {
        const result = await apiRequest('/api/users/profile/giphy', 'PUT', {
            userId: loggedInUser.userId,
            giphyLink: newGiphyLink
        });
        loggedInUser.giphyLink = result.user.giphyLink; // Update local state
        currentUserGiphy.src = loggedInUser.giphyLink || 'https://via.placeholder.com/60?text=No+Giphy';
        profileGiphyPreview.src = loggedInUser.giphyLink || 'https://via.placeholder.com/150?text=No+Giphy';
        giphyFormMessage.textContent = result.message;
        giphyFormMessage.className = 'message success';
    } catch (error) {
        giphyFormMessage.textContent = error.message;
        giphyFormMessage.className = 'message error';
    }
});

changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loggedInUser) return;
    const oldPassword = oldPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmNewPasswordInput.value;

    if (newPassword !== confirmPassword) {
        passwordFormMessage.textContent = "New passwords do not match.";
        passwordFormMessage.className = 'message error';
        return;
    }
    try {
        const result = await apiRequest('/api/users/password', 'PUT', {
            userId: loggedInUser.userId,
            oldPassword,
            newPassword
        });
        passwordFormMessage.textContent = result.message;
        passwordFormMessage.className = 'message success';
        changePasswordForm.reset();
    } catch (error) {
        passwordFormMessage.textContent = error.message;
        passwordFormMessage.className = 'message error';
    }
});


// --- Rendering Functions ---
const TASK_DEFINITIONS_CLIENT = { // For client-side display if needed, points from server are source of truth
    "Cooking": { points: 10, category: "Food" },
    "Washing utensils": { points: 3, category: "Washing utensils" },
    "Cleaning floor with broom": { points: 3, category: "Cleaning room with broom" },
    "Cleaning floor with mob": { points: 5, category: "Clean the room using mob" },
    "Cleaning the toilet": { points: 8, category: "Cleaning the toilet" }
};

const monthlyMinimumsClient = { // Keep consistent with server if possible for display logic
    "Food": 60, "Washing utensils": 18, "Cleaning room with broom": 18,
    "Clean the room using mob": 30, "Cleaning the toilet": 8, "Total": 145
};


function renderPendingApprovals() {
    pendingApprovalsTableBody.innerHTML = "";
    if (!loggedInUser || !allWorkData) return;

    const tasksToApprove = allWorkData.filter(task =>
        task.submitterUserId != loggedInUser.userId &&
        (task.approvalStatus === "Not approved" || task.approvalStatus === "Partially Approved") &&
        task.approver1UserId != loggedInUser.userId && // Not already primary approver
        task.approver2UserId != loggedInUser.userId    // Not already secondary approver (if partially approved by someone else)
    );

    tasksToApprove.forEach(task => {
        let row = pendingApprovalsTableBody.insertRow();
        row.insertCell().textContent = task.entryId.slice(-6); // Short ID
        row.insertCell().textContent = task.submitterUserName;
        row.insertCell().textContent = task.workType;
        row.insertCell().textContent = task.dateOfWork;
        row.insertCell().textContent = task.points;
        row.insertCell().textContent = task.notes || '-';
        let actionsCell = row.insertCell();
        if (task.approvalStatus !== "Approved") { // Should always be true based on filter
            actionsCell.innerHTML = `
                <button class="approve" onclick="approveTask('${task.entryId}')"><i class="fas fa-check"></i> Approve</button>
                <button class="reject" onclick="rejectTask('${task.entryId}')"><i class="fas fa-times"></i> Reject</button>
            `;
        } else {
            actionsCell.textContent = "Already Approved";
        }
    });
}

function renderMyTasks() {
    myTasksTableBody.innerHTML = "";
    if (!loggedInUser || !allWorkData) return;

    const myTasks = allWorkData.filter(task => task.submitterUserId == loggedInUser.userId)
        .sort((a, b) => new Date(b.dateOfWork) - new Date(a.dateOfWork));

    myTasks.forEach(task => {
        let row = myTasksTableBody.insertRow();
        row.insertCell().textContent = task.entryId.slice(-6);
        row.insertCell().textContent = task.workType;
        row.insertCell().textContent = task.dateOfWork;
        row.insertCell().textContent = task.points;
        row.insertCell().textContent = task.approvalStatus;
        let approvers = [];
        if (task.approver1UserName) approvers.push(task.approver1UserName);
        if (task.approver2UserName) approvers.push(task.approver2UserName);
        row.insertCell().textContent = approvers.join(', ') || '-';
        row.insertCell().textContent = task.notes || '-';

        let actionsCell = row.insertCell();
        if (["Not approved", "Partially Approved"].includes(task.approvalStatus)) {
            actionsCell.innerHTML = `
                <button class="edit" onclick="openEditModal('${task.entryId}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="delete" onclick="deleteTask('${task.entryId}')"><i class="fas fa-trash"></i> Delete</button>
            `;
        } else {
            actionsCell.textContent = "N/A";
        }
    });
}

function renderAllApprovedTasks() {
    allApprovedTasksTableBody.innerHTML = "";
    if (!allWorkData) return;

    const filterMonth = filterMonthYearInput.value;
    let tasksToDisplay = allWorkData.filter(task => task.approvalStatus === "Approved");

    if (filterMonth) {
        tasksToDisplay = tasksToDisplay.filter(task => task.month === filterMonth);
    }
    tasksToDisplay.sort((a, b) => new Date(b.dateOfWork) - new Date(a.dateOfWork));


    tasksToDisplay.forEach(task => {
        let row = allApprovedTasksTableBody.insertRow();
        row.insertCell().textContent = task.submitterUserName;
        row.insertCell().textContent = task.workType;
        row.insertCell().textContent = task.dateOfWork;
        row.insertCell().textContent = task.points;
        row.insertCell().textContent = task.notes || '-';
    });
}

function renderLeaderboard() {
    leaderboardContent.innerHTML = "";
    if (!allUsersForLeaderboard || !allWorkData) return;

    const currentMonthFilter = filterMonthYearInput.value || new Date().toISOString().slice(0, 7); // Default to current month

    allUsersForLeaderboard.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'leaderboard-user-entry';
        userDiv.innerHTML = `<h4>${user.userName} (Progress for ${currentMonthFilter})</h4>`;

        let totalPointsMonth = 0;
        const categoryPointsMonth = {};
        // Initialize category points
        for (const key in TASK_DEFINITIONS_CLIENT) {
            categoryPointsMonth[TASK_DEFINITIONS_CLIENT[key].category] = 0;
        }


        allWorkData.filter(task =>
            task.submitterUserId == user.userId &&
            task.approvalStatus === "Approved" &&
            task.month === currentMonthFilter
        ).forEach(task => {
            totalPointsMonth += Number(task.points); // Ensure points is a number
            const taskCategory = TASK_DEFINITIONS_CLIENT[task.workType]?.category;
            if (taskCategory) {
                if (!categoryPointsMonth[taskCategory]) categoryPointsMonth[taskCategory] = 0;
                categoryPointsMonth[taskCategory] += Number(task.points);
            }
        });

        // Display category progress
        for (const categoryKey in monthlyMinimumsClient) {
            if (categoryKey === "Total") continue;

            const points = categoryPointsMonth[categoryKey] || 0;
            const target = monthlyMinimumsClient[categoryKey];
            const percentage = target > 0 ? Math.min((points / target) * 100, 100) : (points > 0 ? 100 : 0);

            const categoryProgressDiv = document.createElement('div');
            categoryProgressDiv.innerHTML = `
                ${categoryKey}: ${points} / ${target} pts
                <div class="points-bar-container">
                    <div class="points-bar ${points >= target ? 'target-met' : ''}" style="width: ${percentage}%;">${percentage.toFixed(0)}%</div>
                </div>
            `;
            userDiv.appendChild(categoryProgressDiv);
        }

        // Display total progress
        const totalTarget = monthlyMinimumsClient["Total"];
        const totalPercentage = totalTarget > 0 ? Math.min((totalPointsMonth / totalTarget) * 100, 100) : (totalPointsMonth > 0 ? 100 : 0);
        const totalProgressDiv = document.createElement('div');
        totalProgressDiv.innerHTML = `
            <strong>Total Monthly Points: ${totalPointsMonth} / ${totalTarget} pts</strong>
            <div class="points-bar-container">
                <div class="points-bar ${totalPointsMonth >= totalTarget ? 'target-met' : ''}" style="width: ${totalPercentage}%;">${totalPercentage.toFixed(0)}%</div>
            </div>
            <hr style="border-color: #00ffff33; margin-top:10px;">`;
        userDiv.appendChild(totalProgressDiv);
        leaderboardContent.appendChild(userDiv);
    });
}


// --- Edit Modal Logic ---
function openEditModal(entryId) {
    const task = allWorkData.find(t => t.entryId === entryId);
    if (!task) return;

    // Populate task types freshly every time to avoid stale list
    editTaskWorkTypeSelect.innerHTML = '';
    for (const type in TASK_DEFINITIONS_CLIENT) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = `${type} (${TASK_DEFINITIONS_CLIENT[type].points} points)`;
        editTaskWorkTypeSelect.appendChild(option);
    }

    editEntryIdInput.value = entryId;
    editTaskWorkTypeSelect.value = task.workType;
    editTaskEntryDateInput.value = task.dateOfWork;
    editTaskNotesInput.value = task.notes || '';
    editTaskFormMessage.textContent = '';

    editModal.classList.remove('hidden');
}



function closeEditModal() {
    editModal.classList.add('hidden');
    editTaskForm.reset();
    editTaskFormMessage.textContent = '';
}


editTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loggedInUser) return;
    const entryId = editEntryIdInput.value;
    const updatedTaskData = {
        workType: editTaskWorkTypeSelect.value,
        dateOfWork: editTaskEntryDateInput.value,
        notes: editTaskNotesInput.value,
        editorUserId: loggedInUser.userId // For server-side permission check
    };
    try {
        const result = await apiRequest(`/api/workdata/${entryId}`, 'PUT', updatedTaskData);
        editTaskFormMessage.textContent = result.message;
        editTaskFormMessage.className = 'message success';
        await fetchAllWorkData();
        setTimeout(closeEditModal, 1500); // Close modal after a delay
    } catch (error) {
        editTaskFormMessage.textContent = error.message;
        editTaskFormMessage.className = 'message error';
    }
});

async function deleteTask(entryId) {
    if (!loggedInUser) return;
    if (!confirm("Are you sure you want to delete this task? This action cannot be undone.")) return;
    try {
        await apiRequest(`/api/workdata/${entryId}`, 'DELETE', { deleterUserId: loggedInUser.userId });
        await fetchAllWorkData();
    } catch (error) {
        alert(`Error deleting task: ${error.message}`);
    }
}

// --- Tabbed Interface Logic ---
function openTab(event, tabName) {
    let i, tabcontent, tabbuttons;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].classList.remove("active");
        tabcontent[i].style.display = "none"; // Ensure hidden
    }
    tabbuttons = document.getElementsByClassName("tab-button");
    for (i = 0; i < tabbuttons.length; i++) {
        tabbuttons[i].classList.remove("active");
    }
    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabName).classList.add("active");
    event.currentTarget.classList.add("active");

    // Refresh data for the opened tab if necessary
    if (tabName === 'dashboardTab') {
        renderLeaderboard();
        renderAllApprovedTasks();
    } else if (tabName === 'pendingApprovalTab') {
        renderPendingApprovals();
    } else if (tabName === 'mySubmissionsTab') {
        renderMyTasks();
    }
}

const giphyUrls = [
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTNiaWx5b3RuNTYzYTB0YjQ2N2h5Y2huNGVweTBrNDhldmJ3NmEzMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/8ccV0iLu3o6RKYBbQg/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2NpMTB0YTQ5bXBxYnRvdnZ1dG85M3Q1aWdscW8zc3lpaG9rYjhjeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/XDaLiUu8VyreM/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTNiaWx5b3RuNTYzYTB0YjQ2N2h5Y2huNGVweTBrNDhldmJ3NmEzMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Ia62g1fUnD1egRBsU0/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTRqdjA3cmo4d3A0ZXJpMnlnYWU0a2J4aW9kMzZrbXc5cXR2aWlwZCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DMvTvmzf38DU4/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTNiaWx5b3RuNTYzYTB0YjQ2N2h5Y2huNGVweTBrNDhldmJ3NmEzMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/MRVkxSAMy4Rlm/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2NpMTB0YTQ5bXBxYnRvdnZ1dG85M3Q1aWdscW8zc3lpaG9rYjhjeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/c7zPSW7VChjEGz9OKP/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTNiaWx5b3RuNTYzYTB0YjQ2N2h5Y2huNGVweTBrNDhldmJ3NmEzMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/iDOFbfYleNxB2nNRcR/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHI1YmZxbHlqODJxMTQxMXFuY25uZTdhdHVoNGkxeDBzMm4xMjU0MyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mPgMdvm4tCaktT48r3/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHI1YmZxbHlqODJxMTQxMXFuY25uZTdhdHVoNGkxeDBzMm4xMjU0MyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/V3bkSmyNMaXY5OMYzL/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHI1YmZxbHlqODJxMTQxMXFuY25uZTdhdHVoNGkxeDBzMm4xMjU0MyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/wdatqOAbgRsvKDXFib/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ2Vqc2U2dGptNGM4NHcwMnRzejF4Y3lnZnIxZjk3anE0bmY3dHFiYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/EaSRzJYZabLZ3LuCvQ/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ2Vqc2U2dGptNGM4NHcwMnRzejF4Y3lnZnIxZjk3anE0bmY3dHFiYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/hOclin2KcAEOcZEnXK/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaXN3cWJvaWI4MjR2aHkwcTVpOWJhZG9pMWk3dnd2ZGV3c2h6M2x4YyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xT9IgwyWeqTRqRmJK8/giphy.gif"
];

function rotateLoginGiphy() {
    const giphyElement = document.getElementById("loginGiphy");
    if (!giphyElement) return;

    const randomUrl = giphyUrls[Math.floor(Math.random() * giphyUrls.length)];
    giphyElement.src = randomUrl;
}

// Change giphy every 30 seconds
setInterval(rotateLoginGiphy, 10000);



// --- Initial Load ---
window.addEventListener('DOMContentLoaded', () => {
    // Initially, only login is visible
    loginSection.classList.add('active');
    loginSection.classList.remove('hidden');
    mainAppInterface.classList.add('hidden');
    mainAppInterface.classList.remove('active');
    rotateLoginGiphy();
    // Default to dashboard tab being active once logged in
    document.querySelector('.tab-button').click(); // Click the first tab
});