import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer'; 
import dotenv from 'dotenv'; 
 
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// =========================
// ✅ Schemas
// =========================

// 1️⃣ Form submission collection → idcards
const idCardSchema = new mongoose.Schema({
  registerNumber: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  dob: String,
  department: String,
  year: String,
  section: String,
  libraryCode: String,
  photo: { data: Buffer, contentType: String, originalName: String },
  reason: String,
  status: { type: String, default: 'pending' },
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
idCardSchema.index({ registerNumber: 1 }, { unique: true });
const IdCard = mongoose.model('IdCard', idCardSchema, 'idcards');

// 2️⃣ Login check collection → regnumbers
const regNumberSchema = new mongoose.Schema({
  registerNumber: { type: String, required: true, unique: true },
});
const RegNumber = mongoose.model('RegNumber', regNumberSchema, 'regnumbers');

// 3️⃣ Print ID check collection → printids
const printIdSchema = new mongoose.Schema({
  registerNumber: { type: String, required: true, unique: true },
});
const PrintId = mongoose.model('PrintId', printIdSchema, 'printids');

// 4️⃣ Accepted ID cards collection → acceptedidcards
const acceptedIdCardSchema = new mongoose.Schema({
  registerNumber: { type: String, required: true, unique: true },
  name: String,
  dob: String,
  department: String,
  year: String,
  section: String,
  libraryCode: String,
  reason: String,
  createdAt: { type: Date, default: Date.now }
});
const AcceptedIdCard = mongoose.model('AcceptedIdCard', acceptedIdCardSchema, 'acceptedidcards');

// 5️⃣ Accepted history ID collection → acchistoryid
const accHistoryIdSchema = new mongoose.Schema({
  registerNumber: { type: String, required: true },
  name: { type: String },
  dob: { type: String },
  department: { type: String },
  year: { type: String },
  section: { type: String },
  libraryCode: { type: String },
  reason: { type: String },
  createdAt: { type: Date },
  copiedAt: { type: Date, default: Date.now },
  sourceCollection: { type: String, default: 'acceptedidcards' },
});
const AccHistoryId = mongoose.model('AccHistoryId', accHistoryIdSchema, 'acchistoryid');

// 6️⃣ Rejected ID cards collection → rejectedidcards
const rejectedIdCardSchema = new mongoose.Schema({
  registerNumber: { type: String, required: true, unique: true },
  name: String,
  dob: String,
  department: String,
  year: String,
  section: String,
  libraryCode: String,
  reason: String,
  createdAt: { type: Date, default: Date.now },
});
const RejectedIdCard = mongoose.model('RejectedIdCard', rejectedIdCardSchema, 'rejectedidcards');

// 7️⃣ Rejected history ID collection → rejhistoryids
const rejHistoryIdSchema = new mongoose.Schema({
  registerNumber: { type: String, required: true },
  name: String,
  dob: String,
  department: String,
  year: String,
  section: String,
  libraryCode: String,
  reason: String,
  createdAt: { type: Date },
  copiedAt: { type: Date, default: Date.now },
  sourceCollection: { type: String, default: 'rejectedidcards' },
});
const RejHistoryId = mongoose.model('RejHistoryId', rejHistoryIdSchema, 'rejhistoryids');

// =========================
// ✅ Routes
// =========================

// 🔐 Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    let { registerNumber } = req.body;
    console.log('Received registerNumber:', registerNumber);

    if (!registerNumber) {
      return res.status(400).json({ success: false, message: 'Register number is required.' });
    }

    registerNumber = registerNumber.trim().toUpperCase();

    const exists = await RegNumber.findOne({ registerNumber });
    console.log('DB query result:', exists);

    if (!exists) {
      return res.status(401).json({ success: false, message: 'Register number not found.' });
    }

    return res.status(200).json({ success: true, message: 'Login successful.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// 📥 Form submission endpoint (saves to idcards)
app.post('/api/idcards', upload.single('photo'), async (req, res) => {
  try {
    const { registerNumber, name, department, year, section, reason, dob, libraryCode } = req.body;

    if (!registerNumber || !name) {
      return res.status(400).json({ success: false, message: 'registerNumber and name are required.' });
    }

    let photo = null;
    if (req.file) {
      photo = { data: req.file.buffer, contentType: req.file.mimetype, originalName: req.file.originalname };
    }

    const newIdCard = new IdCard({ registerNumber, name, department, year, section, reason, dob, libraryCode, photo });
    await newIdCard.save();

    res.status(201).json({ success: true, message: 'Form data saved successfully.' });
  } catch (error) {
    console.error(error);
    if (error.name === 'MongoServerError' && error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An application with this register number already exists.' });
    }
    res.status(500).json({ success: false, message: 'Error saving form data.' });
  }
});

// 🔍 Fetch all applications
app.get('/api/idcards', async (req, res) => {
  try {
    const applications = await IdCard.find({}).select('-photo.data').sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error fetching applications.' });
  }
});

// 🔍 Fetch application by register number
app.get('/api/idcards/:registerNumber', async (req, res) => {
  try {
    const { registerNumber } = req.params;
    const application = await IdCard.findOne({ registerNumber }).select('-photo.data');

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    res.json({ success: true, application });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error fetching application.' });
  }
});

// ✅ Update status
app.patch('/api/idcards/:registerNumber/status', express.json(), async (req, res) => {
  try {
    const { registerNumber } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'status is required' });

    const updated = await IdCard.findOneAndUpdate(
      { registerNumber },
      { status, lastUpdated: new Date() },
      { new: true }
    ).select('-photo.data');

    if (!updated) return res.status(404).json({ success: false, message: 'Application not found.' });

    res.json({ success: true, application: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error updating status.' });
  }
});

// Endpoint to check if registerNumber is in printids
app.get('/api/printids/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Checking printids collection for register number:', registerNumber);

    const found = await PrintId.findOne({ registerNumber });
    console.log('PrintId query result:', found);

    res.json({ found: !!found });
  } catch (error) {
    console.error('Error checking printids collection:', error);
    res.status(500).json({ found: false, error: 'Server error' });
  }
});

// Endpoint to check if registerNumber is in acceptedidcards
app.get('/api/acceptedidcards/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Checking acceptedidcards collection for register number:', registerNumber);

    const found = await AcceptedIdCard.findOne({ registerNumber });
    console.log('AcceptedIdCard query result:', found);

    res.json({ found: !!found });
  } catch (error) {
    console.error('Error checking acceptedidcards collection:', error);
    res.status(500).json({ found: false, error: 'Server error' });
  }
});

// New endpoint to get comprehensive status for a register number
app.get('/api/status/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Checking comprehensive status for register number:', registerNumber);

    const [idCardRequest, printingStatus, acceptedStatus, rejectedStatus] = await Promise.all([
      IdCard.findOne({ registerNumber }),
      PrintId.findOne({ registerNumber }),
      AcceptedIdCard.findOne({ registerNumber }),
      RejectedIdCard.findOne({ registerNumber })
    ]);

    let status = 'none';
    let formEnabled = true;
    let buttonText = 'Submit Request';

    if (idCardRequest) {
      status = 'under-review';
      formEnabled = false;
      buttonText = 'Request already submitted';
    } else if (printingStatus) {
      status = 'approved-printing';
      formEnabled = false;
      buttonText = 'Request already submitted';
    } else if (acceptedStatus) {
      status = 'ready-pickup';
      formEnabled = true;
      buttonText = 'Submit Request';
    } else if (rejectedStatus) {
      status = 'rejected';
      formEnabled = false;
      buttonText = 'Request rejected';
    }

    res.json({
      success: true,
      status,
      formEnabled,
      buttonText,
      details: {
        hasIdCardRequest: !!idCardRequest,
        isPrinting: !!printingStatus,
        isReadyForPickup: !!acceptedStatus,
        isRejected: !!rejectedStatus
      }
    });
  } catch (error) {
    console.error('Error checking comprehensive status:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Endpoint to fetch accepted ID cards for a specific user
app.get('/api/acceptedidcards/user/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Fetching accepted ID cards for register number:', registerNumber);

    const acceptedCards = await AcceptedIdCard.find({ registerNumber }).sort({ createdAt: -1 });
    console.log('Found accepted ID cards:', acceptedCards);

    res.json(acceptedCards);
  } catch (error) {
    console.error('Error fetching accepted ID cards for user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Endpoint to fetch historical ID cards from acchistoryid collection for a specific user
app.get('/api/acchistoryid/user/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Fetching historical ID cards for register number:', registerNumber);

    const historyCards = await AccHistoryId.find({ registerNumber }).sort({ createdAt: -1 });
    console.log('Found historical ID cards:', historyCards);

    res.json(historyCards);
  } catch (error) {
    console.error('Error fetching historical ID cards for user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Fixed: Copy entire acceptedidcards doc into acchistoryid
app.post('/api/acceptedidcards/transfer-to-history/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Transferring accepted ID cards to history for register number:', registerNumber);

    const acceptedCards = await AcceptedIdCard.find({ registerNumber });
    console.log('Found accepted ID cards to transfer:', acceptedCards);

    if (acceptedCards.length === 0) {
      return res.status(404).json({ success: false, message: 'No accepted ID cards found for this user.' });
    }

    const transferPromises = acceptedCards.map(async (card) => {
      const historyRecord = new AccHistoryId({
        registerNumber: card.registerNumber,
        name: card.name,
        dob: card.dob,
        department: card.department,
        year: card.year,
        section: card.section,
        libraryCode: card.libraryCode,
        reason: card.reason,
        createdAt: card.createdAt,
        sourceCollection: 'acceptedidcards'
      });
      
      await historyRecord.save();
      await AcceptedIdCard.deleteOne({ _id: card._id });
      return historyRecord;
    });

    const transferredRecords = await Promise.all(transferPromises);
    console.log('Successfully transferred records:', transferredRecords.length);

    res.json({ 
      success: true, 
      message: `Successfully transferred ${transferredRecords.length} ID cards to history.`,
      transferredCount: transferredRecords.length
    });
  } catch (error) {
    console.error('Error transferring accepted ID cards to history:', error);
    res.status(500).json({ success: false, error: 'Server error during transfer' }); 
  } 
});

// 🔍 Check if registerNumber is in rejectedidcards
app.get('/api/rejectedidcards/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Checking rejectedidcards collection for register number:', registerNumber);

    const rejectedCard = await RejectedIdCard.findOne({ registerNumber });
    console.log('RejectedIdCard query result:', rejectedCard);

    if (rejectedCard) {
      res.json({ 
        found: true, 
        rejectedCard: {
          registerNumber: rejectedCard.registerNumber,
          name: rejectedCard.name,
          rejectionReason: rejectedCard.rejectionReason,
          createdAt: rejectedCard.createdAt
        }
      });
    } else {
      res.json({ found: false });
    }
  } catch (error) {
    console.error('Error checking rejectedidcards collection:', error);
    res.status(500).json({ found: false, error: 'Server error' });
  }
});

// ✅ Transfer rejected ID card to history
app.post('/api/rejectedidcards/transfer-to-history/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Transferring rejected ID card to history for register number:', registerNumber);

    const rejectedCard = await RejectedIdCard.findOne({ registerNumber });
    console.log('Found rejected ID card to transfer:', rejectedCard);

    if (!rejectedCard) {
      return res.status(404).json({ success: false, message: 'No rejected ID card found for this user.' });
    }

    // Create history record
    const historyRecord = new RejHistoryId({
      registerNumber: rejectedCard.registerNumber,
      name: rejectedCard.name,
      dob: rejectedCard.dob,
      department: rejectedCard.department,
      year: rejectedCard.year,
      section: rejectedCard.section,
      libraryCode: rejectedCard.libraryCode,
      reason: rejectedCard.reason,
      createdAt: rejectedCard.createdAt,
      sourceCollection: 'rejectedidcards'
    });
    
    await historyRecord.save();
    await RejectedIdCard.deleteOne({ _id: rejectedCard._id });
    
    console.log('Successfully transferred rejected card to history');

    res.json({ 
      success: true, 
      message: 'Successfully transferred rejected ID card to history.',
      transferredCount: 1
    });
  } catch (error) {
    console.error('Error transferring rejected ID card to history:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ success: false, error: 'Server error during transfer' }); 
  } 
});
 
app.get('/api/rejhistoryids/user/:registerNumber', async (req, res) => {
  try {
    const registerNumber = req.params.registerNumber.trim();
    console.log('Fetching rejected history ID cards for register number:', registerNumber);

    const rejectedHistoryCards = await RejHistoryId.find({ registerNumber }).sort({ createdAt: -1 });
    console.log('Found rejected history ID cards:', rejectedHistoryCards);

    res.json(rejectedHistoryCards);
  } catch (error) {
    console.error('Error fetching rejected history ID cards for user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server 
app.listen(PORT, () => { 
  console.log(`Server running on http://localhost:${PORT}`);
});