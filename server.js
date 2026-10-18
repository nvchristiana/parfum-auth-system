require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET belum diisi di file .env');
  process.exit(1);
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  console.error('ERROR: GOOGLE_CLIENT_ID belum diisi di file .env');
  process.exit(1);
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const users = [
  { id: 1, username: 'staff_jatim', password: 'password123', role: 'Branch_Staff', region: 'Jatim', name: 'Budi Staff Jatim' },
  { id: 2, username: 'staff_jateng', password: 'password123', role: 'Branch_Staff', region: 'Jateng', name: 'Siti Staff Jateng' },
  { id: 3, username: 'spv_jatim', password: 'password123', role: 'SPV_Area', region: 'Jatim', name: 'Andi SPV Jatim' },
  { id: 4, username: 'spv_kalimantan', password: 'password123', role: 'SPV_Area', region: 'Kalimantan', name: 'Dewi SPV Kalimantan' },
  { id: 5, username: 'auditor_ho', password: 'password123', role: 'HO_Auditor', region: 'HO', name: 'Novi Auditor Pusat' }
];

let promoExpenses = [
  {
    id: 101,
    noReffPromo: 'REF-PARFUM-JATIM-01',
    namaParfum: 'Vanilla Musk EDP 50ml',
    region: 'Jatim',
    amount: 12500000,
    budgetLimit: 10000000,
    isOverBudget: true,
    statusApproval: 'PENDING_SPV_APPROVAL',
    createdBy: 'staff_jatim'
  },
  {
    id: 102,
    noReffPromo: 'REF-PARFUM-JATENG-01',
    namaParfum: 'Floral Blossom Cologne 100ml',
    region: 'Jateng',
    amount: 8000000,
    budgetLimit: 10000000,
    isOverBudget: false,
    statusApproval: 'APPROVED',
    createdBy: 'staff_jateng'
  }
];

let nextExpenseId = 103;

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Access token is missing.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
    }
    req.user = decodedUser;
    next();
  });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Role '${req.user ? req.user.role : 'Guest'}' does not have permission.`
      });
    }
    next();
  };
}

function verifyUpBudgetApprovalABAC(req, res, next) {
  const expenseId = parseInt(req.params.id);
  const expense = promoExpenses.find(item => item.id === expenseId);

  if (!expense) {
    return res.status(404).json({ error: 'Promo expense data not found.' });
  }

  if (!expense.isOverBudget) {
    return res.status(400).json({ error: 'Bad Request: Expense is not over budget.' });
  }

  if (req.user.region !== expense.region) {
    return res.status(403).json({
      error: `Forbidden: ABAC Violation. User region '${req.user.region}' does not match promo region '${expense.region}'.`
    });
  }

  req.targetExpense = expense;
  next();
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, region: user.region, name: user.name },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  res.json({
    message: 'Login successful via JWT',
    accessToken: token,
    tokenType: 'Bearer',
    user: { name: user.name, role: user.role, region: user.region }
  });
});

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

app.post('/api/auth/google', async (req, res) => {
  const { googleIdToken } = req.body;

  if (!googleIdToken) {
    return res.status(400).json({ error: 'Google ID Token is required.' });
  }

  try {
    // Verifikasi ID Token langsung ke Google (tanda tangan, audience, expiry)
    const ticket = await googleClient.verifyIdToken({
      idToken: googleIdToken,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload.email_verified) {
      return res.status(401).json({ error: 'Unauthorized: Google email is not verified.' });
    }

    // Cari user berdasarkan email Google. Jika belum ada, buat user baru
    // dengan hak akses paling minimum (Principle of Least Privilege).
    let user = users.find(u => u.email === payload.email);
    if (!user) {
      user = {
        id: users.length + 1,
        username: payload.email,
        email: payload.email,
        role: 'Branch_Staff',
        region: 'Jatim',
        name: payload.name || payload.email
      };
      users.push(user);
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, region: user.region, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      message: 'OAuth 2.0 Login successful',
      provider: 'Google Identity Service',
      accessToken: token,
      tokenType: 'Bearer',
      user: { name: user.name, email: user.email, role: user.role, region: user.region }
    });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Google ID Token.' });
  }
});

app.get('/api/promos', authenticateToken, (req, res) => {
  if (req.user.role === 'HO_Auditor') {
    return res.json({
      accessType: 'Global HO View',
      totalData: promoExpenses.length,
      data: promoExpenses
    });
  }

  const filteredData = promoExpenses.filter(item => item.region === req.user.region);
  res.json({
    accessType: `Filtered Regional View (${req.user.region})`,
    totalData: filteredData.length,
    data: filteredData
  });
});

app.post('/api/promos', authenticateToken, requireRole('Branch_Staff'), (req, res) => {
  const { noReffPromo, namaParfum, region, amount, budgetLimit } = req.body;

  if (req.user.region !== region) {
    return res.status(403).json({
      error: `Forbidden: ABAC Violation. Staff from region '${req.user.region}' cannot create promo for region '${region}'.`
    });
  }

  const isOver = amount > budgetLimit;
  const newPromo = {
    id: nextExpenseId++,
    noReffPromo,
    namaParfum,
    region,
    amount,
    budgetLimit,
    isOverBudget: isOver,
    statusApproval: isOver ? 'OVER_BUDGET_PENDING_APPROVAL' : 'AUTO_APPROVED',
    createdBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  promoExpenses.push(newPromo);
  res.status(201).json({
    message: isOver ? 'Promo created with OVER-BUDGET status' : 'Promo created and AUTO_APPROVED',
    data: newPromo
  });
});

app.patch(
  '/api/promos/:id/approve-up-budget',
  authenticateToken,
  requireRole('SPV_Area'),
  verifyUpBudgetApprovalABAC,
  (req, res) => {
    req.targetExpense.statusApproval = 'APPROVED_BY_SPV';
    req.targetExpense.approvedBy = req.user.name;
    req.targetExpense.approvedAt = new Date().toISOString();

    res.json({
      message: `Up-budget promo ID ${req.targetExpense.id} approved.`,
      updatedExpense: req.targetExpense
    });
  }
);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});