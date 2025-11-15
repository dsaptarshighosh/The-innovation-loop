// ---------------- QUIZ STORAGE HELPERS ----------------
function loadQuizzes() {
    return JSON.parse(localStorage.getItem("quizzes") || "[]");
}

function saveQuizzes(q) {
    localStorage.setItem("quizzes", JSON.stringify(q));
}

function loadQuizAttempts() {
    return JSON.parse(localStorage.getItem("quizAttempts") || "[]");
}

function saveQuizAttempts(a) {
    localStorage.setItem("quizAttempts", JSON.stringify(a));
}

// Global variables
let currentUser = null;
let currentRole = 'teacher';
let currentQR = null;
let qrTimer = null;
let countdownTimer = null;
let sessionTimer = null;
let sessionStartTime = null;
let videoStream = null;
let isScanning = false;
let sessionActive = false;
let qrGeneratedCount = 0;
let teacherLocation = null;
let studentLocation = null;
let locationPermissionGranted = false;

// Initialize data from localStorage
let attendanceData = JSON.parse(localStorage.getItem('attendanceData')) || [];
let sessionData = JSON.parse(localStorage.getItem('sessionData')) || {};

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const icon = document.getElementById('notificationIcon');
    const text = document.getElementById('notificationText');
    
    notification.className = `notification ${type}`;
    text.textContent = message;
    
    if (type === 'success') {
        icon.className = 'fas fa-check-circle mr-3 text-green-500';
    } else if (type === 'error') {
        icon.className = 'fas fa-exclamation-circle mr-3 text-red-500';
    } else if (type === 'warning') {
        icon.className = 'fas fa-exclamation-triangle mr-3 text-orange-500';
    } else {
        icon.className = 'fas fa-info-circle mr-3 text-blue-500';
    }
    
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// Role selection
document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentRole = this.dataset.role;
    });
});

// Login form submission
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('userName').value.trim();
    const id = document.getElementById('userId').value.trim();
    
    if (!name || !id) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    // Store user session
    currentUser = { name, id, role: currentRole };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // Show appropriate dashboard
    if (currentRole === 'teacher') {
        showTeacherDashboard();
    } else {
        showStudentDashboard();
    }
});

// Show teacher dashboard
function showTeacherDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('teacherDashboard').classList.add('active');
    document.getElementById('studentDashboard').classList.remove('active');
    
    document.getElementById('teacherName').textContent = currentUser.name;
    updateTeacherStats();
    updateAttendanceTable();

    // attach quiz modal handlers (safe to reattach)
    const createBtn = document.getElementById("createQuizBtn");
    if (createBtn && !createBtn._quizHandlerAttached) {
        createBtn.addEventListener("click", () => {
            document.getElementById("quizModal").classList.remove("hidden");
        });
        createBtn._quizHandlerAttached = true;
    }
    const closeQuiz = document.getElementById("closeQuizBtn");
    if (closeQuiz && !closeQuiz._quizHandlerAttached) {
        closeQuiz.addEventListener("click", () => {
            document.getElementById("quizModal").classList.add("hidden");
        });
        closeQuiz._quizHandlerAttached = true;
    }

    // ensure save handler is attached once
    const saveBtn = document.getElementById("saveQuizBtn");
    if (saveBtn && !saveBtn._quizSaveAttached) {
        saveBtn.addEventListener("click", () => {
            const title = document.getElementById("quizTitle").value.trim();
            const question = document.getElementById("quizQuestion").value.trim();
            const answer = document.getElementById("quizAnswer").value.trim();

            // read marks input if exists, else default to 1
            let marks = 1;
            const marksElem = document.getElementById("quizMarks");
            if (marksElem) {
                const parsed = parseInt(marksElem.value, 10);
                if (!isNaN(parsed) && parsed > 0) marks = parsed;
            }

            if (!title || !question || !answer) {
                alert("Please fill all fields.");
                return;
            }

            const quizzes = loadQuizzes();

            quizzes.push({
                id: Date.now(),
                title,
                question,
                answer,
                marks: marks
            });

            saveQuizzes(quizzes);
            alert("Quiz Saved Successfully!");

            // Reset and close modal
            document.getElementById("quizTitle").value = "";
            document.getElementById("quizQuestion").value = "";
            document.getElementById("quizAnswer").value = "";
            if (marksElem) marksElem.value = "";
            document.getElementById("quizModal").classList.add("hidden");

            // refresh leaderboard
            displayLeaderboard();
        });
        saveBtn._quizSaveAttached = true;
    }

    // Display leaderboard (dynamically create a container if not present)
    displayLeaderboard();

    // Initialize QR code
    generateQRCode();
}

// Create or update a simple leaderboard panel in teacher dashboard
function displayLeaderboard() {
    // Find or create container under teacher dashboard controls
    let container = document.getElementById('quizLeaderboardContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'quizLeaderboardContainer';
        container.className = 'feature-card';
        // try to insert after the Create Quiz button area if present
        const createBtnDiv = document.getElementById('createQuizBtn');
        if (createBtnDiv && createBtnDiv.parentElement) {
            createBtnDiv.parentElement.insertAdjacentElement('afterend', container);
        } else {
            // fallback: append to teacher dashboard main container
            const main = document.querySelector('#teacherDashboard .container') || document.getElementById('teacherDashboard');
            if (main) main.prepend(container);
            else document.body.appendChild(container);
        }
    }

    const quizzes = loadQuizzes();
    const attempts = loadQuizAttempts();

    if (!quizzes.length) {
        container.innerHTML = `<h3 class="text-2xl font-semibold mb-4 neon-text-blue">Quiz Leaderboard</h3>
                               <p class="text-gray-400">No quizzes created yet.</p>`;
        return;
    }

    // Show leaderboard for the latest quiz
    const latestQuiz = quizzes[quizzes.length - 1];
    const latestAttempts = attempts.filter(a => a.quizId === latestQuiz.id);

    let html = `<h3 class="text-2xl font-semibold mb-4 neon-text-blue">
                    Quiz Leaderboard - ${escapeHtml(latestQuiz.title)} (${latestQuiz.marks || 1} marks)
                </h3>`;

    if (!latestAttempts.length) {
        html += "<p class='text-gray-400'>No attempts yet.</p>";
    } else {
        // Sort by marksAwarded desc then by time asc
        latestAttempts.sort((a, b) => {
            const diff = (b.marksAwarded || 0) - (a.marksAwarded || 0);
            if (diff !== 0) return diff;
            return a.submittedAt - b.submittedAt;
        });

        html += `<div class="overflow-x-auto"><table class="attendance-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Student</th>
                            <th>Student ID</th>
                            <th>Answer</th>
                            <th>Marks</th>
                            <th>Max</th>
                            <th>Time</th>
                        </tr>
                    </thead><tbody>`;

        latestAttempts.forEach((at, idx) => {
            html += `<tr>
                        <td>${idx + 1}</td>
                        <td>${escapeHtml(at.studentName || at.studentId)}</td>
                        <td>${escapeHtml(at.studentId)}</td>
                        <td>${escapeHtml(at.answer)}</td>
                        <td>${typeof at.marksAwarded !== 'undefined' ? at.marksAwarded : (at.correct ? (latestQuiz.marks || 1) : 0)}</td>
                        <td>${latestQuiz.marks || 1}</td>
                        <td>${new Date(at.submittedAt).toLocaleString()}</td>
                    </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    container.innerHTML = html;
}

// small helper to avoid injection in table cells (not strictly necessary offline but good practice)
function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>"'`=\/]/g, function(s) {
        return ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;','=':'&#x3D;','/':'&#x2F;'
        })[s];
    });
}

// ---------------- TEACHER CREATE QUIZ ----------------
// (Handlers attached in showTeacherDashboard to avoid duplicate listeners)

// Show student dashboard
function showStudentDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('studentDashboard').classList.add('active');
    document.getElementById('teacherDashboard').classList.remove('active');
    
    document.getElementById('studentName').textContent = currentUser.name;
    document.getElementById('studentDisplayName').textContent = currentUser.name;
    document.getElementById('studentDisplayId').textContent = currentUser.id;
    
    updateStudentHistory();
    checkTodayAttendance();

    // LOAD QUIZZES FOR STUDENT (after checking attendance)
    loadStudentQuizzes();
    
    // Request location permission
    requestLocationPermission();
}

// ---------------- LOAD STUDENT QUIZZES ----------------
function loadStudentQuizzes() {
    const quizzes = loadQuizzes();
    const today = new Date().toDateString();

    // Check attendanceData array for today's attendance for the current user
    const attendedToday = attendanceData.some(record =>
        record.id === currentUser.id && new Date(record.timestamp).toDateString() === today
    );

    const section = document.getElementById("studentQuizSection");
    if (!quizzes.length || !attendedToday) {
        // hide section if no quiz or student hasn't marked attendance
        if (section) section.classList.add("hidden");
        return;
    }

    if (section) section.classList.remove("hidden");

    const list = document.getElementById("availableQuizzesList");
    if (!list) return;
    list.innerHTML = "";

    quizzes.forEach(q => {
        const marks = q.marks || 1;
        const card = document.createElement("div");
        card.className = "feature-card p-4";

        card.innerHTML = `
            <h3 class="text-xl font-semibold mb-2">${escapeHtml(q.title)} <span style="font-weight:600;color:#facc15;">(${marks} marks)</span></h3>
            <p class="text-gray-400 mb-4">${escapeHtml(q.question)}</p>
            <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg w-full"
                onclick="openQuizAttempt(${q.id})">Attempt Quiz</button>
        `;

        list.appendChild(card);
    });
}

// Request location permission
function requestLocationPermission() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                studentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                locationPermissionGranted = true;
                updateLocationStatus();
                showNotification('Location access granted', 'success');
            },
            (error) => {
                locationPermissionGranted = false;
                updateLocationStatus();
                showNotification('Location access denied. Attendance may not be verified.', 'warning');
            }
        );
    } else {
        showNotification('Geolocation is not supported by your browser', 'error');
    }
}
// ---------------- STUDENT OPEN QUIZ ----------------
let __currentAttemptingQuiz = null; // internal pointer to currently opened quiz for grading

function openQuizAttempt(quizId) {
    const quizzes = loadQuizzes();
    const quiz = quizzes.find(q => q.id === quizId);

    if (!quiz) return;

    __currentAttemptingQuiz = quiz; // set pointer so submit can access marks easily

    document.getElementById("studentQuizTitle").innerText = quiz.title;

    const marks = quiz.marks || 1;

    document.getElementById("studentQuizQuestions").innerHTML = `
        <p class="text-gray-300 mb-2">${escapeHtml(quiz.question)} <span style="color: #facc15; font-weight:600">(${marks} marks)</span></p>
        <input id="studentQuizAnswer" 
               class="input-field" 
               placeholder="Your Answer">
    `;

    document.getElementById("studentQuizPopup").classList.remove("hidden");
}

// Update location status display
function updateLocationStatus() {
    const locationStatus = document.getElementById('locationStatus');
    const locationText = document.getElementById('locationText');
    const locationMessage = document.getElementById('locationMessage');
    const locationCoords = document.getElementById('locationCoords');
    
    if (locationPermissionGranted && studentLocation) {
        locationStatus.className = 'location-badge';
        locationText.textContent = 'Location Verified';
        locationMessage.textContent = 'Location access granted';
        locationCoords.textContent = `Lat: ${studentLocation.lat.toFixed(6)}, Lng: ${studentLocation.lng.toFixed(6)}`;
    } else {
        locationStatus.className = 'location-badge denied';
        locationText.textContent = 'Location Denied';
        locationMessage.textContent = 'Location access required for attendance';
        locationCoords.textContent = 'Enable location in browser settings';
    }
}

// Generate QR Code
function generateQRCode() {
    const qrContainer = document.getElementById('qrcode');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';
    
    // Generate unique QR data with location
    currentQR = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        sessionId: sessionData.id || 'default',
        teacherLocation: teacherLocation,
        className: sessionData.className || 'Unknown'
    };
    
    // Create real QR code
    new QRCode(qrContainer, {
        text: JSON.stringify(currentQR),
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
    
    qrGeneratedCount++;
    document.getElementById('qrGenerated').textContent = qrGeneratedCount;
    
    // Start countdown if session is active
    if (sessionActive) {
        startQRCountdown();
    }
}

// Start QR countdown
function startQRCountdown() {
    clearInterval(countdownTimer);
    let timeLeft = 60;
    
    const updateTimer = () => {
        const timerElement = document.getElementById('qrTimer');
        timerElement.textContent = `QR expires in: ${timeLeft}s`;
        timerElement.style.color = timeLeft <= 10 ? '#ef4444' : 'var(--neon-blue)';
        
        if (timeLeft <= 0) {
            generateQRCode();
        }
    };
    
    updateTimer();
    countdownTimer = setInterval(() => {
        timeLeft--;
        updateTimer();
    }, 1000);
}

// Set teacher location
document.getElementById('setLocationBtn').addEventListener('click', function() {
    if (navigator.geolocation) {
        const btn = this;
        btn.innerHTML = '<div class="loading-spinner"></div>';
        btn.disabled = true;
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                teacherLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                
                const locationDiv = document.getElementById('teacherLocation');
                locationDiv.innerHTML = `
                    <i class="fas fa-check-circle text-green-500 mr-1"></i>
                    Location set: ${teacherLocation.lat.toFixed(6)}, ${teacherLocation.lng.toFixed(6)}
                `;
                
                btn.innerHTML = '<i class="fas fa-map-pin"></i>';
                btn.disabled = false;
                
                showNotification('Teacher location set successfully', 'success');
            },
            (error) => {
                btn.innerHTML = '<i class="fas fa-map-pin"></i>';
                btn.disabled = false;
                showNotification('Failed to get location', 'error');
            }
        );
    }
});

// Check location for student
document.getElementById('checkLocationBtn').addEventListener('click', function() {
    const btn = this;
    btn.innerHTML = '<div class="loading-spinner"></div>';
    btn.disabled = true;
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            studentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            locationPermissionGranted = true;
            updateLocationStatus();
            
            btn.innerHTML = '<i class="fas fa-location-arrow mr-2"></i>Check Location';
            btn.disabled = false;
            
            showNotification('Location verified successfully', 'success');
        },
        (error) => {
            locationPermissionGranted = false;
            updateLocationStatus();
            
            btn.innerHTML = '<i class="fas fa-location-arrow mr-2"></i>Check Location';
            btn.disabled = false;
            
            showNotification('Location access denied', 'error');
        }
    );
});

// Start session
document.getElementById('startSessionBtn').addEventListener('click', function() {
    sessionActive = true;
    sessionStartTime = new Date();
    sessionData = {
        id: Math.random().toString(36).substring(7),
        className: document.getElementById('className').value,
        expectedStudents: document.getElementById('expectedStudents').value,
        startTime: sessionStartTime.toISOString(),
        location: document.getElementById('classLocation').value
    };
    localStorage.setItem('sessionData', JSON.stringify(sessionData));
    
    showNotification('Session started successfully!', 'success');
    generateQRCode();
    startSessionTimer();
    
    this.disabled = true;
    document.getElementById('endSessionBtn').disabled = false;
});

// End session
document.getElementById('endSessionBtn').addEventListener('click', function() {
    sessionActive = false;
    clearInterval(countdownTimer);
    clearInterval(sessionTimer);
    
    document.getElementById('qrTimer').textContent = 'Session ended';
    showNotification('Session ended', 'info');
    
    document.getElementById('startSessionBtn').disabled = false;
    this.disabled = true;
});

// Session timer
function startSessionTimer() {
    sessionTimer = setInterval(() => {
        if (sessionStartTime) {
            const elapsed = Math.floor((new Date() - sessionStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('sessionTime').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// Update teacher stats
function updateTeacherStats() {
    const today = new Date().toDateString();
    const todayAttendance = attendanceData.filter(record => 
        new Date(record.timestamp).toDateString() === today
    );
    
    document.getElementById('totalStudents').textContent = todayAttendance.length;
    
    const expected = parseInt(document.getElementById('expectedStudents').value) || 100;
    const rate = expected > 0 ? Math.round((todayAttendance.length / expected) * 100) : 0;
    
    const locationVerified = todayAttendance.filter(record => record.locationVerified).length;
    document.getElementById('locationVerified').textContent = locationVerified;
}

// Update attendance table
function updateAttendanceTable() {
    const attendanceList = document.getElementById('attendanceList');
    const noRecords = document.getElementById('noRecords');
    
    if (attendanceData.length === 0) {
        attendanceList.innerHTML = '';
        noRecords.style.display = 'block';
        return;
    }
    
    noRecords.style.display = 'none';
    attendanceList.innerHTML = attendanceData.slice(-10).reverse().map((record, index) => `
        <tr class="scan-success">
            <td>${attendanceData.length - index}</td>
            <td>${escapeHtml(record.name)}</td>
            <td>${escapeHtml(record.id)}</td>
            <td>${new Date(record.timestamp).toLocaleTimeString()}</td>
            <td>
                ${record.locationVerified ? 
                    '<span class="location-badge"><i class="fas fa-check mr-1"></i>Verified</span>' : 
                    '<span class="location-badge"><i class="fas fa-check mr-1"></i>Verified</span>'}
            </td>
            <td><span class="px-2 py-1 bg-green-900 text-green-300 rounded-full text-sm">Present</span></td>
        </tr>
    `).join('');
}

let html5QrScanner = null;

document.getElementById('startScanBtn').addEventListener('click', async () => {
    isScanning = true;

    document.getElementById('startScanBtn').classList.add('hidden');
    document.getElementById('stopScanBtn').classList.remove('hidden');

    html5QrScanner = new Html5Qrcode("videoElement");

    html5QrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
            if (isScanning) {
                isScanning = false;

                html5QrScanner.stop();
                document.getElementById('stopScanBtn').classList.add('hidden');
                document.getElementById('startScanBtn').classList.remove('hidden');

                onQRScanSuccess(decodedText);
            }
        },
        () => {}
    ).catch(err => {
        showNotification("Failed to start camera", "error");
    });
});

document.getElementById('stopScanBtn').addEventListener('click', () => {
    isScanning = false;

    if (html5QrScanner) {
        html5QrScanner.stop().then(() => {
            document.getElementById('stopScanBtn').classList.add('hidden');
            document.getElementById('startScanBtn').classList.remove('hidden');
        });
    }
});

// Manual QR submission
document.getElementById('manualSubmitBtn').addEventListener('click', function() {
    const manualInput = document.getElementById('manualQRInput').value.trim();
    if (manualInput) {
        onQRScanSuccess(manualInput);
        document.getElementById('manualQRInput').value = '';
    } else {
        showNotification('Please enter QR code', 'error');
    }
});

// Calculate distance between two coordinates
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // Distance in meters
}

// Handle successful QR scan
function onQRScanSuccess(decodedText) {
    try {
        let qrData;
        try {
            qrData = JSON.parse(decodedText);
        } catch {
            // If it's not JSON, treat it as a simple QR code
            qrData = { id: decodedText, timestamp: new Date().toISOString() };
        }
        
        // Check if QR is valid (not expired)
        const qrTime = new Date(qrData.timestamp);
        const now = new Date();
        const timeDiff = (now - qrTime) / 1000; // seconds
        
        if (timeDiff > 60) {
            showNotification('QR code has expired. Please ask for a new one.', 'error');
            return;
        }
        
        // Check if already marked today
        const today = new Date().toDateString();
        const alreadyMarked = attendanceData.some(record => 
            record.id === currentUser.id && 
            new Date(record.timestamp).toDateString() === today
        );
        
        if (alreadyMarked) {
            showNotification('Attendance already marked for today!', 'error');
            return;
        }
        
        // Verify location
        let locationVerified = false;
        if (locationPermissionGranted && studentLocation && qrData.teacherLocation) {
            const distance = calculateDistance(
                studentLocation.lat, studentLocation.lng,
                qrData.teacherLocation.lat, qrData.teacherLocation.lng
            );
            // Consider verified if within 30 meters (demo radius)
            locationVerified = distance <= 30;
        }
        
        if (!locationVerified) {
            showNotification('Location verification failed. You may not be in the class.', 'warning');
        }
        else{
            showNotification('Location verified. You are in the class.', 'success');
        }
        
        // Mark attendance
        const attendanceRecord = {
            name: currentUser.name,
            id: currentUser.id,
            timestamp: new Date().toISOString(),
            qrData: qrData,
            className: qrData.className || 'Unknown',
            locationVerified: locationVerified,
            studentLocation: studentLocation,
            distance: locationVerified ? calculateDistance(
                studentLocation.lat, studentLocation.lng,
                qrData.teacherLocation.lat, qrData.teacherLocation.lng
            ) : null
        };
        
        attendanceData.push(attendanceRecord);
        localStorage.setItem('attendanceData', JSON.stringify(attendanceData));
        
        // Update UI
        document.getElementById('attendanceStatus').textContent = 'Present';
        document.getElementById('attendanceStatus').className = 'text-3xl font-bold text-green-500';
        
        updateStudentHistory();
        updateAttendanceTable();
        updateTeacherStats();

        // Ensure student quizzes re-evaluated after attendance marked
        try { loadStudentQuizzes(); } catch(e) { /* ignore if not available */ }

        showNotification(locationVerified ? 
            'Attendance marked successfully with location verification!' : 
            'Attendance marked successfully!', 
            locationVerified ? 'success' : 'success'
        );
        
        // Stop scanner
        document.getElementById('stopScanBtn').click();
        
    } catch (err) {
        showNotification('Invalid QR code', 'error');
    }
}

// Update student history
function updateStudentHistory() {
    const studentHistory = document.getElementById('studentHistory');
    const noHistory = document.getElementById('noHistory');
    
    const studentRecords = attendanceData.filter(record => record.id === currentUser.id);
    
    if (studentRecords.length === 0) {
        if (studentHistory) studentHistory.innerHTML = '';
        if (noHistory) noHistory.style.display = 'block';
        return;
    }
    
    if (noHistory) noHistory.style.display = 'none';
    if (!studentHistory) return;

    studentHistory.innerHTML = studentRecords.slice(-5).reverse().map(record => `
        <tr>
            <td>${new Date(record.timestamp).toLocaleDateString()}</td>
            <td>${escapeHtml(record.className || 'N/A')}</td>
            <td>${new Date(record.timestamp).toLocaleTimeString()}</td>
            <td>
                <span class="location-badge">
                    <i class="fas fa-check mr-1"></i>
                    ${record.distance ? record.distance.toFixed(0) + 'm' : 'Verified'}
                </span>
            </td>
            <td>
                <span class="px-2 py-1 bg-green-900 text-green-300 rounded-full text-sm">
                    Present
                </span>
            </td>
        </tr>
    `).join('');
}

// Check today's attendance status
function checkTodayAttendance() {
    const today = new Date().toDateString();
    const todayRecord = attendanceData.find(record => 
        record.id === currentUser.id && 
        new Date(record.timestamp).toDateString() === today
    );
    
    if (todayRecord) {
        document.getElementById('attendanceStatus').textContent = 'Present';
        document.getElementById('attendanceStatus').className = 'text-3xl font-bold text-green-500';
    } else {
        document.getElementById('attendanceStatus').textContent = 'Not Marked';
        document.getElementById('attendanceStatus').className = 'text-3xl font-bold text-yellow-500';
    }
}

// Clear attendance
document.getElementById('clearAttendanceBtn').addEventListener('click', function() {
    if (confirm('Are you sure you want to clear all attendance records?')) {
        attendanceData = [];
        localStorage.setItem('attendanceData', JSON.stringify(attendanceData));
        updateAttendanceTable();
        updateTeacherStats();
        showNotification('All attendance records cleared', 'info');
    }
});

// Export attendance (Modified to export a tab-separated file with .xls extension)
document.getElementById('exportBtn').addEventListener('click', function() {
    const tab = '\t'; 
    const header = ['Name', 'ID', 'Timestamp', 'Class', 'Location Verified', 'Distance(m)'].join(tab);
    const dataRows = attendanceData.map(e => 
        [
            e.name,
            e.id,
            e.timestamp,
            e.className || '',
            e.locationVerified || false,
            e.distance !== null ? e.distance.toFixed(2) + 'm' : 'N/A'
        ].join(tab)
    ).join('\n');
    const tsvContent = header + '\n' + dataRows;
    const excelContent = "data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent(tsvContent);
    const link = document.createElement("a");
    link.setAttribute("href", excelContent);
    link.setAttribute("download", `attendance_${new Date().toISOString().split('T')[0]}.xls`); 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Attendance data exported successfully to .xls (Tab Separated) file!', 'success');
});

// ---------------- STUDENT SUBMIT QUIZ ANSWER ----------------
function submitQuizAnswers() {
    const quizzes = loadQuizzes();
    const title = document.getElementById("studentQuizTitle").innerText;
    const quiz = quizzes.find(q => q.title === title);

    if (!quiz) {
        alert("Quiz not found.");
        return;
    }

    const studentAnswerElem = document.getElementById("studentQuizAnswer");
    const studentAnswer = studentAnswerElem ? studentAnswerElem.value.trim() : '';
    if (!studentAnswer) return alert("Enter an answer.");

    const attempts = loadQuizAttempts();

    const isCorrect = studentAnswer.toLowerCase() === (quiz.answer || '').toLowerCase();
    const maxMarks = quiz.marks || 1;
    const marksAwarded = isCorrect ? maxMarks : 0;

    attempts.push({
        quizId: quiz.id,
        studentId: currentUser.id,
        studentName: currentUser.name,
        answer: studentAnswer,
        correct: isCorrect,
        marksAwarded: marksAwarded,
        maxMarks: maxMarks,
        submittedAt: Date.now()
    });

    saveQuizAttempts(attempts);

    alert(`Quiz submitted! You scored: ${marksAwarded}/${maxMarks}`);
    closeStudentQuizPopup();

    // update teacher leaderboard in case teacher is online
    displayLeaderboard();
}

// Provide alias to match possible typo in HTML
function submituizAnswers() {
    return submitQuizAnswers();
}

// Generate QR button
document.getElementById('generateQRBtn').addEventListener('click', function() {
    generateQRCode();
    showNotification('New QR code generated!', 'success');
});

// Logout function
function logout() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    
    // Stop any running processes
    if (videoStream) {
        try { videoStream.getTracks().forEach(track => track.stop()); } catch(e){}
    }
    clearInterval(countdownTimer);
    clearInterval(sessionTimer);
    
    // Reset UI
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('teacherDashboard').classList.remove('active');
    document.getElementById('studentDashboard').classList.remove('active');
    document.getElementById('loginForm').reset();
    
    showNotification('Logged out successfully', 'info');
}

// Check for existing session on page load
window.addEventListener('load', function() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        if (currentUser.role === 'teacher') {
            showTeacherDashboard();
        } else {
            showStudentDashboard();
        }
    }
});

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Ensure login page is visible
    document.getElementById('loginPage').style.display = 'flex';
    
    // Add fade-in animation
    setTimeout(() => {
        const fade = document.querySelector('.fade-in');
        if (fade) fade.classList.add('visible');
    }, 100);
});

function closeStudentQuizPopup() {
    document.getElementById("studentQuizPopup").classList.add("hidden");
}
