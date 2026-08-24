const fs = require('fs');
const path = require('path');

// 1. Update database.ts
const dbContent = `import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

let isConnected = false;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (isConnected) {
    return mongoose;
  }

  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri && mongoUri.trim() !== '') {
    try {
      const sanitizedUri = mongoUri.replace(/:([^:@]{1,8})@/, ':****@');
      console.log(\`[Database] Connecting to MongoDB Atlas / Production Database at \${sanitizedUri}...\`);
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 8000,
      });
      isConnected = true;
      console.log('[Database] ✅ Successfully connected to MongoDB Atlas / Production Database.');
      return mongoose;
    } catch (err: any) {
      console.error('[Database] ❌ CRITICAL: Failed to connect to configured MongoDB Atlas URI:', err.message);
      if (process.env.NODE_ENV === 'production') {
        throw new Error(\`MongoDB Atlas Connection Error: \${err.message}\`);
      }
      console.warn('[Database] Falling back to local MongoDB engine for development environment.');
    }
  }

  // Development embedded engine
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    console.log(\`[Database] Initialized development MongoDB engine at \${uri}\`);
    await mongoose.connect(uri);
    isConnected = true;
    console.log('[Database] ✅ Connected to development MongoDB NoSQL engine.');
    return mongoose;
  } catch (error: any) {
    console.error('[Database] ❌ Fatal error initializing MongoDB NoSQL engine:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[Database] Disconnected from MongoDB.');
  }
}
`;

fs.writeFileSync(path.join(__dirname, 'backend/src/config/database.ts'), dbContent.trim() + '\n', 'utf8');
console.log('Updated backend/src/config/database.ts');

// 2. Enhance AuthContext to validate token on refresh
const authContextPath = path.join(__dirname, 'frontend/src/context/AuthContext.tsx');
let authContent = fs.readFileSync(authContextPath, 'utf8');

if (!authContent.includes('apiRequest(\'/auth/me\')')) {
  authContent = authContent.replace(
    `    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setToken(savedToken);
        setUser(parsedUser);
        if (savedBranch) {
          setActiveBranchId(savedBranch);
        } else if (parsedUser.branchId) {
          setActiveBranchId(parsedUser.branchId);
        }
      } catch (err) {
        localStorage.removeItem('ihms_token');
        localStorage.removeItem('ihms_user');
      }
    }
    setLoading(false);`,
    `    if (savedToken) {
      setToken(savedToken);
      apiRequest('/auth/me')
        .then((res) => {
          if (res.success && res.data) {
            setUser(res.data);
            localStorage.setItem('ihms_user', JSON.stringify(res.data));
            if (savedBranch) {
              setActiveBranchId(savedBranch);
            } else if (res.data.branchId) {
              setActiveBranchId(res.data.branchId);
            }
          } else {
            localStorage.removeItem('ihms_token');
            localStorage.removeItem('ihms_user');
            setToken(null);
            setUser(null);
          }
        })
        .catch(() => {
          localStorage.removeItem('ihms_token');
          localStorage.removeItem('ihms_user');
          setToken(null);
          setUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }`
  );
  fs.writeFileSync(authContextPath, authContent, 'utf8');
  console.log('Updated frontend/src/context/AuthContext.tsx with live token validation on refresh.');
}