import React, { useState, useEffect } from 'react';
import type { Schema } from "../../amplify/data/resource";
import { generateClient } from "aws-amplify/data";

// Configure client to use API key for public access
const client = generateClient<Schema>({
  authMode: 'apiKey'
});

interface DriverFormData {
  driverId: string;
  name: string;
  kana: string;
  company: string;
  employeeNo: string;
  mail: string;
  birthday: string;
  phoneNumber: string;
  driversLicenseNo: string;
  issueDate: string;
  expirationDate: string;
  color: string;
  fileSeq1: string;
  fileSeq2: string;
  fullAdmin: boolean;
}

interface AdminDriverManagementProps {
  onBack?: () => void;
  user?: any; // Keep interface for compatibility but make it optional
}

const AdminDriverManagement: React.FC<AdminDriverManagementProps> = ({ onBack }) => {
  const [drivers, setDrivers] = useState<Array<Schema["Driver"]["type"]>>([]);
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showFullAdminManager, setShowFullAdminManager] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<DriverFormData>({
    driverId: '',
    name: '',
    kana: '',
    company: '',
    employeeNo: '',
    mail: '',
    birthday: '',
    phoneNumber: '',
    driversLicenseNo: '',
    issueDate: '',
    expirationDate: '',
    color: '1',
    fileSeq1: '0',
    fileSeq2: '0',
    fullAdmin: false,
  });
  const [formData, setFormData] = useState<DriverFormData>({
    driverId: '',
    name: '',
    kana: '',
    company: '',
    employeeNo: '',
    mail: '',
    birthday: '',
    phoneNumber: '',
    driversLicenseNo: '',
    issueDate: '',
    expirationDate: '',
    color: '1',
    fileSeq1: '0',
    fileSeq2: '0',
    fullAdmin: false,
  });

  // Temporarily bypass admin check for authentication removal
  const isAdmin = true; // user?.signInDetails?.loginId === "tts-driver-admin@teral.co.jp" || user?.username === "tts-driver-admin@teral.co.jp";

  useEffect(() => {
    if (isAdmin) {
      loadDrivers();
    }
  }, [isAdmin]);

  const loadDrivers = async () => {
    try {
      console.log('🔄 Loading drivers...');
      let allDrivers: Array<Schema["Driver"]["type"]> = [];
      let nextToken: string | undefined = undefined;
      let pageCount = 0;

      // Fetch all pages of drivers
      do {
        pageCount++;
        console.log(`📄 Loading page ${pageCount}...`);
        
        const queryOptions: any = {
          filter: { isDeleted: { eq: false } },
          limit: 1000, // Maximum allowed limit
        };
        
        if (nextToken) {
          queryOptions.nextToken = nextToken;
        }
        
        const result = await client.models.Driver.list(queryOptions);

        allDrivers = allDrivers.concat(result.data);
        nextToken = result.nextToken || undefined;
        
        console.log(`✅ Page ${pageCount}: Loaded ${result.data.length} drivers (Total so far: ${allDrivers.length})`);
      } while (nextToken);

      console.log(`🎯 Finished loading all drivers. Total: ${allDrivers.length} drivers across ${pageCount} pages`);
      setDrivers(allDrivers);
      
      if (allDrivers.length > 0) {
        setStatus(`✅ ${allDrivers.length}人のドライバーを読み込みました`);
      }
    } catch (error) {
      console.error('Failed to load drivers:', error);
      setStatus('ドライバー一覧の読み込みに失敗しました: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleInputChange = (field: keyof DriverFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'fullAdmin' ? value === 'true' : value
    }));
  };

  const handleEditInputChange = (field: keyof DriverFormData, value: string) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: field === 'fullAdmin' ? value === 'true' : value
    }));
  };

  const getUserIdFromEmail = (email: string): string => {
    return email.split('@')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const userId = getUserIdFromEmail(formData.mail);
      const currentUser = "guest"; // getUserIdFromEmail(user?.signInDetails?.loginId || user?.username || '');
      const now = new Date().toISOString();

      await client.models.Driver.create({
        userId: userId,
        driverId: parseInt(formData.driverId) || 999999999,
        name: formData.name,
        kana: formData.kana,
        company: formData.company,
        employeeNo: formData.employeeNo,
        mail: formData.mail,
        birthday: formData.birthday + 'T00:00:00.000Z', // Convert date to datetime format
        phoneNumber: formData.phoneNumber,
        driversLicenseNo: formData.driversLicenseNo,
        issueDate: formData.issueDate + 'T00:00:00.000Z', // Convert date to datetime format
        expirationDate: formData.expirationDate + 'T00:00:00.000Z', // Convert date to datetime format
        color: parseInt(formData.color),
        fileSeq1: parseInt(formData.fileSeq1),
        fileSeq2: parseInt(formData.fileSeq2),
        fullAdmin: formData.fullAdmin,
        isDeleted: false,
        createUser: currentUser,
        createDate: now,
        updateUser: currentUser,
        updateDate: now,
      });

      setStatus('ドライバーが正常に作成されました');
      setShowForm(false);
      setFormData({
        driverId: '',
        name: '',
        kana: '',
        company: '',
        employeeNo: '',
        mail: '',
        birthday: '',
        phoneNumber: '',
        driversLicenseNo: '',
        issueDate: '',
        expirationDate: '',
        color: '1',
        fileSeq1: '0',
        fileSeq2: '0',
        fullAdmin: false,
      });
      loadDrivers();
    } catch (error) {
      console.error('Failed to create driver:', error);
      setStatus('ドライバーの作成に失敗しました: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleEdit = (driver: Schema["Driver"]["type"]) => {
    setEditingDriver(driver.id!);
    setEditFormData({
      driverId: driver.driverId?.toString() || '',
      name: driver.name,
      kana: driver.kana,
      company: driver.company,
      employeeNo: driver.employeeNo,
      mail: driver.mail,
      birthday: driver.birthday.split('T')[0], // Convert datetime to date
      phoneNumber: driver.phoneNumber,
      driversLicenseNo: driver.driversLicenseNo,
      issueDate: driver.issueDate.split('T')[0], // Convert datetime to date
      expirationDate: driver.expirationDate.split('T')[0], // Convert datetime to date
      color: driver.color.toString(),
      fileSeq1: driver.fileSeq1.toString(),
      fileSeq2: driver.fileSeq2.toString(),
      fullAdmin: driver.fullAdmin || false,
    });
  };

  const handleUpdate = async (driverId: string) => {
    try {
      const currentUser = "guest"; // getUserIdFromEmail(user?.signInDetails?.loginId || user?.username || '');
      const now = new Date().toISOString();
      const userId = getUserIdFromEmail(editFormData.mail);

      await client.models.Driver.update({
        id: driverId,
        userId: userId,
        driverId: parseInt(editFormData.driverId) || 999999999,
        name: editFormData.name,
        kana: editFormData.kana,
        company: editFormData.company,
        employeeNo: editFormData.employeeNo,
        mail: editFormData.mail,
        birthday: editFormData.birthday + 'T00:00:00.000Z',
        phoneNumber: editFormData.phoneNumber,
        driversLicenseNo: editFormData.driversLicenseNo,
        issueDate: editFormData.issueDate + 'T00:00:00.000Z',
        expirationDate: editFormData.expirationDate + 'T00:00:00.000Z',
        color: parseInt(editFormData.color),
        fileSeq1: parseInt(editFormData.fileSeq1),
        fileSeq2: parseInt(editFormData.fileSeq2),
        fullAdmin: editFormData.fullAdmin,
        updateUser: currentUser,
        updateDate: now,
      });

      setStatus('ドライバー情報が正常に更新されました');
      setEditingDriver(null);
      loadDrivers();
    } catch (error) {
      console.error('Failed to update driver:', error);
      setStatus('ドライバー情報の更新に失敗しました: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleCancelEdit = () => {
    setEditingDriver(null);
    setEditFormData({
      driverId: '',
      name: '',
      kana: '',
      company: '',
      employeeNo: '',
      mail: '',
      birthday: '',
      phoneNumber: '',
      driversLicenseNo: '',
      issueDate: '',
      expirationDate: '',
      color: '1',
      fileSeq1: '0',
      fileSeq2: '0',
      fullAdmin: false,
    });
  };

  const handleDelete = async (driverId: string) => {
    if (!confirm('このドライバーを削除しますか？')) return;

    try {
      await client.models.Driver.update({
        id: driverId,
        isDeleted: true,
        updateUser: "guest", // getUserIdFromEmail(user?.signInDetails?.loginId || user?.username || ''),
        updateDate: new Date().toISOString(),
      });
      setStatus('ドライバーが削除されました');
      loadDrivers();
    } catch (error) {
      console.error('Failed to delete driver:', error);
      setStatus('ドライバーの削除に失敗しました');
    }
  };

  const handleToggleFullAdmin = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;

    const newStatus = !driver.fullAdmin;
    const confirmMessage = newStatus 
      ? `${driver.name}にフル管理者権限を付与しますか？`
      : `${driver.name}のフル管理者権限を削除しますか？`;
    
    if (!confirm(confirmMessage)) return;

    try {
      await client.models.Driver.update({
        id: driverId,
        fullAdmin: newStatus,
        updateUser: "guest", // getUserIdFromEmail(user?.signInDetails?.loginId || user?.username || ''),
        updateDate: new Date().toISOString(),
      });
      
      const successMessage = newStatus 
        ? `${driver.name}にフル管理者権限を付与しました`
        : `${driver.name}のフル管理者権限を削除しました`;
      setStatus(successMessage);
      loadDrivers();
    } catch (error) {
      console.error('Failed to toggle full admin privileges:', error);
      const errorMessage = newStatus 
        ? 'フル管理者権限の付与に失敗しました'
        : 'フル管理者権限の削除に失敗しました';
      setStatus(errorMessage);
    }
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCsvFile(file || null);
  };

  const parseCsvData = (csvText: string): any[] => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSVファイルにはヘッダー行とデータ行が必要です');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const expectedHeaders = [
      'driverId', 'name', 'kana', 'company', 'employeeNo', 'mail', 
      'birthday', 'phoneNumber', 'driversLicenseNo', 'issueDate', 
      'expirationDate', 'color'
    ];

    // Validate headers
    const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`必要な列が不足しています: ${missingHeaders.join(', ')}`);
    }

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length !== headers.length) {
        throw new Error(`行 ${i + 1}: 列数が一致しません (期待: ${headers.length}, 実際: ${values.length})`);
      }

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      // Validate required fields
      if (!row.driverId || !row.name || !row.kana || !row.company || !row.employeeNo || !row.mail) {
        throw new Error(`行 ${i + 1}: 必須フィールドが空です`);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.mail)) {
        throw new Error(`行 ${i + 1}: 無効なメールアドレス形式: ${row.mail}`);
      }

      // Validate and normalize date formats (accepts M/D/YYYY, MM/DD/YYYY, M-D-YYYY, MM-DD-YYYY)
      const validateAndNormalizeDate = (dateStr: string, fieldName: string, rowNum: number): string => {
        if (!dateStr || dateStr.trim() === '') {
          throw new Error(`行 ${rowNum}: ${fieldName}が空です`);
        }

        // Support multiple date formats: M/D/YYYY, MM/DD/YYYY, M-D-YYYY, MM-DD-YYYY
        const dateRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
        const match = dateStr.trim().match(dateRegex);
        
        if (!match) {
          throw new Error(`行 ${rowNum}: 無効な${fieldName}形式。サポート形式: M/D/YYYY, MM/DD/YYYY, M-D-YYYY, MM-DD-YYYY (例: 7/1/2000, 07-01-2000): ${dateStr}`);
        }

        const [, month, day, year] = match;
        
        // Validate month and day ranges
        const monthNum = parseInt(month, 10);
        const dayNum = parseInt(day, 10);
        
        if (monthNum < 1 || monthNum > 12) {
          throw new Error(`行 ${rowNum}: 無効な月 (1-12): ${month} in ${dateStr}`);
        }
        
        if (dayNum < 1 || dayNum > 31) {
          throw new Error(`行 ${rowNum}: 無効な日 (1-31): ${day} in ${dateStr}`);
        }

        // Return normalized MM-DD-YYYY format
        const normalizedMonth = month.padStart(2, '0');
        const normalizedDay = day.padStart(2, '0');
        return `${normalizedMonth}-${normalizedDay}-${year}`;
      };

      // Validate and normalize all date fields
      try {
        row.birthday = validateAndNormalizeDate(row.birthday, '生年月日', i + 1);
        row.issueDate = validateAndNormalizeDate(row.issueDate, '免許証交付日', i + 1);
        row.expirationDate = validateAndNormalizeDate(row.expirationDate, '免許証有効期限', i + 1);
      } catch (error) {
        throw error; // Re-throw the specific validation error
      }

      // Validate color (1, 2, or 3)
      if (!['1', '2', '3'].includes(row.color)) {
        throw new Error(`行 ${i + 1}: 無効な免許証の色 (1=ゴールド, 2=ブルー, 3=グリーン): ${row.color}`);
      }

      data.push(row);
    }

    return data;
  };

  const convertDateFormat = (mmddyyyy: string): string => {
    // Convert MM-DD-YYYY to YYYY-MM-DD
    const [month, day, year] = mmddyyyy.split('-');
    return `${year}-${month}-${day}`;
  };

  const handleBulkImport = async () => {
    if (!csvFile) {
      setStatus('CSVファイルを選択してください');
      return;
    }

    setIsImporting(true);
    
    try {
      // Read CSV file
      const csvText = await csvFile.text();
      const driversData = parseCsvData(csvText);

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      const currentUser = "guest"; // getUserIdFromEmail(user?.signInDetails?.loginId || user?.username || '');
      const now = new Date().toISOString();

      // Import each driver
      for (const driverData of driversData) {
        try {
          const userId = getUserIdFromEmail(driverData.mail);
          
          await client.models.Driver.create({
            userId: userId,
            driverId: parseInt(driverData.driverId),
            name: driverData.name,
            kana: driverData.kana,
            company: driverData.company,
            employeeNo: driverData.employeeNo,
            mail: driverData.mail,
            birthday: convertDateFormat(driverData.birthday) + 'T00:00:00.000Z',
            phoneNumber: driverData.phoneNumber,
            driversLicenseNo: driverData.driversLicenseNo,
            issueDate: convertDateFormat(driverData.issueDate) + 'T00:00:00.000Z',
            expirationDate: convertDateFormat(driverData.expirationDate) + 'T00:00:00.000Z',
            color: parseInt(driverData.color),
            fileSeq1: 0,
            fileSeq2: 0,
            isDeleted: false,
            createUser: currentUser,
            createDate: now,
            updateUser: currentUser,
            updateDate: now,
          });
          successCount++;
        } catch (error) {
          errorCount++;
          errors.push(`${driverData.name} (${driverData.mail}): ${error instanceof Error ? error.message : '不明なエラー'}`);
        }
      }

      // Show results
      if (errorCount === 0) {
        setStatus(`✅ ${successCount}人のドライバーが正常に登録されました`);
      } else {
        setStatus(`⚠️ ${successCount}人成功、${errorCount}人失敗。エラー詳細: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`);
      }

      setCsvFile(null);
      setShowBulkImport(false);
      loadDrivers();

    } catch (error) {
      console.error('Error importing drivers:', error);
      setStatus(`❌ インポートエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Add the expiration check function
  const isExpirationSoon = (expirationDate: string): boolean => {
    const expDate = new Date(expirationDate);
    const currentDate = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(currentDate.getMonth() + 3);
    return expDate <= threeMonthsFromNow;
  };

  // Temporarily bypass admin access restriction
  // if (!isAdmin) {
  //   return (
  //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
  //       <div className="max-w-4xl mx-auto">
  //         <h1 className="text-xl font-bold text-red-600 mb-4">アクセス拒否</h1>
  //         <p className="text-gray-600">このページにアクセスする権限がありません。</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-500 text-white p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">ドライバー管理 (管理者)</h1>
          {onBack && (
            <button 
              onClick={onBack}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
            >
              ← 戻る
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Action Buttons */}
        <div className="mb-6 flex flex-wrap gap-4">
          <button
            onClick={() => {
              setShowForm(!showForm);
              setShowBulkImport(false);
              setShowFullAdminManager(false);
            }}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded font-medium"
          >
            {showForm ? 'フォームを閉じる' : '新しいドライバーを追加'}
          </button>
          
          <button
            onClick={() => {
              setShowBulkImport(!showBulkImport);
              setShowForm(false);
              setShowFullAdminManager(false);
            }}
            className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded font-medium"
          >
            {showBulkImport ? '一括登録を閉じる' : '一括登録 (CSV)'}
          </button>
          
          <button
            onClick={() => {
              setShowFullAdminManager(!showFullAdminManager);
              setShowForm(false);
              setShowBulkImport(false);
            }}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded font-medium"
          >
            {showFullAdminManager ? 'フル管理者設定を閉じる' : 'フル管理者権限設定'}
          </button>
        </div>

        {/* Status Messages */}
        {status && (
          <div className={`p-4 rounded-md mb-4 ${
            status.includes('失敗') 
              ? 'bg-red-100 text-red-700 border border-red-300' 
              : 'bg-green-100 text-green-700 border border-green-300'
          }`}>
            {status}
          </div>
        )}

        {/* Add Driver Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-bold mb-4">新しいドライバーを追加</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ドライバーID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.driverId}
                    onChange={(e) => handleInputChange('driverId', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    氏名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    氏名カナ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.kana}
                    onChange={(e) => handleInputChange('kana', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    会社 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => handleInputChange('company', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    社員番号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.employeeNo}
                    onChange={(e) => handleInputChange('employeeNo', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    メールアドレス <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.mail}
                    onChange={(e) => handleInputChange('mail', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    生年月日 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => handleInputChange('birthday', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    携帯番号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    pattern="[0-9]{11}"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    免許証番号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.driversLicenseNo}
                    onChange={(e) => handleInputChange('driversLicenseNo', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    pattern="[0-9]+"
                    title="数字のみ入力してください"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    免許証交付日 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => handleInputChange('issueDate', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    免許証有効期限 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.expirationDate}
                    onChange={(e) => handleInputChange('expirationDate', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    免許証の色 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.color}
                    onChange={(e) => handleInputChange('color', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="1">ゴールド</option>
                    <option value="2">ブルー</option>
                    <option value="3">グリーン</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    管理者権限
                  </label>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="fullAdmin"
                      checked={formData.fullAdmin}
                      onChange={(e) => handleInputChange('fullAdmin', e.target.checked.toString())}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <label htmlFor="fullAdmin" className="ml-2 text-sm text-gray-700">
                      フル管理者権限を付与する
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded font-medium"
                >
                  ドライバーを作成
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded font-medium"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Bulk Import Form */}
        {showBulkImport && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-bold mb-4">一括ドライバー登録 (CSV)</h2>
            
            {/* Instructions */}
            <div className="bg-purple-50 border border-purple-200 rounded-md p-4 mb-4">
              <h3 className="font-semibold text-purple-800 mb-2">使用方法:</h3>
              <p className="text-sm text-purple-700 mb-2">
                以下の列を含むCSVファイルを準備してください:
              </p>
              <div className="bg-purple-100 p-3 rounded text-xs text-purple-800 overflow-x-auto">
                <div className="font-semibold mb-2">必要な列 (この順序で):</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  <div>• driverId (ドライバーID)</div>
                  <div>• name (氏名)</div>
                  <div>• kana (氏名カナ)</div>
                  <div>• company (会社)</div>
                  <div>• employeeNo (社員番号)</div>
                  <div>• mail (メールアドレス)</div>
                  <div>• birthday (生年月日: 複数形式対応)</div>
                  <div>• phoneNumber (携帯番号)</div>
                  <div>• driversLicenseNo (免許証番号)</div>
                  <div>• issueDate (免許証交付日: 複数形式対応)</div>
                  <div>• expirationDate (免許証有効期限: 複数形式対応)</div>
                  <div>• color (免許証の色: 1=ゴールド, 2=ブルー, 3=グリーン)</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-purple-600">
                <strong>注意:</strong> 日付は複数形式に対応: M/D/YYYY, MM/DD/YYYY, M-D-YYYY, MM-DD-YYYY (例: 7/1/2000, 07-01-2000)
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CSVファイル <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFileChange}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                required
              />
              {csvFile && (
                <div className="mt-2 text-sm text-gray-600">
                  選択されたファイル: {csvFile.name}
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={isImporting || !csvFile}
                className="bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white px-4 py-2 rounded-md"
              >
                {isImporting ? '登録中...' : '一括登録実行'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBulkImport(false);
                  setCsvFile(null);
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Full Admin Management */}
        {showFullAdminManager && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-bold mb-4">フル管理者権限設定</h2>
            
            <div className="bg-orange-50 border border-orange-200 rounded-md p-4 mb-4">
              <h3 className="font-semibold text-orange-800 mb-2">フル管理者権限について:</h3>
              <p className="text-sm text-orange-700 mb-2">
                フル管理者権限を持つユーザーは以下の操作が可能です:
              </p>
              <ul className="text-sm text-orange-700 list-disc list-inside space-y-1">
                <li>ドライバー管理（作成、編集、削除）</li>
                <li>安全運転管理機能へのアクセス</li>
                <li>全ての申請の承認・却下</li>
                <li>システム設定の変更</li>
              </ul>
            </div>

            <div className="space-y-6">
              {/* Current Full Admins */}
              <div>
                <h3 className="font-medium text-gray-800 mb-3">現在のフル管理者一覧</h3>
                <div className="grid gap-3">
                  {drivers.filter(driver => driver.fullAdmin).map((driver) => (
                    <div key={driver.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{driver.name}</div>
                        <div className="text-sm text-gray-600">{driver.mail}</div>
                        <div className="text-sm text-gray-500">{driver.company} - {driver.employeeNo}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                          フル管理者
                        </span>
                        <button
                          onClick={() => handleToggleFullAdmin(driver.id!)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                          title="フル管理者権限を削除"
                        >
                          権限削除
                        </button>
                      </div>
                    </div>
                  ))}
                  {drivers.filter(driver => driver.fullAdmin).length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      現在、フル管理者権限を持つドライバーはいません
                    </div>
                  )}
                </div>
              </div>

              {/* Regular Drivers (can be promoted to Full Admin) */}
              <div>
                <h3 className="font-medium text-gray-800 mb-3">一般ドライバー（フル管理者権限付与可能）</h3>
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {drivers.filter(driver => !driver.fullAdmin).map((driver) => (
                    <div key={driver.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-md">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{driver.name}</div>
                        <div className="text-sm text-gray-600">{driver.mail}</div>
                        <div className="text-sm text-gray-500">{driver.company} - {driver.employeeNo}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                          一般ドライバー
                        </span>
                        <button
                          onClick={() => handleToggleFullAdmin(driver.id!)}
                          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                          title="フル管理者権限を付与"
                        >
                          権限付与
                        </button>
                      </div>
                    </div>
                  ))}
                  {drivers.filter(driver => !driver.fullAdmin).length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      フル管理者権限を付与可能なドライバーはいません
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Drivers List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-bold mb-4">登録済みドライバー一覧</h2>
          <div className="space-y-3">
            {drivers.map((driver) => (
              <div key={driver.id} className="border border-gray-200 rounded-lg p-4">
                {editingDriver === driver.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ドライバーID</label>
                        <input
                          type="number"
                          value={editFormData.driverId}
                          onChange={(e) => handleEditInputChange('driverId', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">氏名</label>
                        <input
                          type="text"
                          value={editFormData.name}
                          onChange={(e) => handleEditInputChange('name', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">氏名カナ</label>
                        <input
                          type="text"
                          value={editFormData.kana}
                          onChange={(e) => handleEditInputChange('kana', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">会社</label>
                        <input
                          type="text"
                          value={editFormData.company}
                          onChange={(e) => handleEditInputChange('company', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">社員番号</label>
                        <input
                          type="text"
                          value={editFormData.employeeNo}
                          onChange={(e) => handleEditInputChange('employeeNo', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                        <input
                          type="email"
                          value={editFormData.mail}
                          onChange={(e) => handleEditInputChange('mail', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">生年月日</label>
                        <input
                          type="date"
                          value={editFormData.birthday}
                          onChange={(e) => handleEditInputChange('birthday', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">携帯番号</label>
                        <input
                          type="tel"
                          value={editFormData.phoneNumber}
                          onChange={(e) => handleEditInputChange('phoneNumber', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">免許証番号</label>
                        <input
                          type="text"
                          value={editFormData.driversLicenseNo}
                          onChange={(e) => handleEditInputChange('driversLicenseNo', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                          pattern="[0-9]+"
                          title="数字のみ入力してください"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">免許証交付日</label>
                        <input
                          type="date"
                          value={editFormData.issueDate}
                          onChange={(e) => handleEditInputChange('issueDate', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">免許証有効期限</label>
                        <input
                          type="date"
                          value={editFormData.expirationDate}
                          onChange={(e) => handleEditInputChange('expirationDate', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">免許証の色</label>
                        <select
                          value={editFormData.color}
                          onChange={(e) => handleEditInputChange('color', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="1">ゴールド</option>
                          <option value="2">ブルー</option>
                          <option value="3">グリーン</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          管理者権限
                        </label>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="editFullAdmin"
                            checked={editFormData.fullAdmin}
                            onChange={(e) => handleEditInputChange('fullAdmin', e.target.checked.toString())}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <label htmlFor="editFullAdmin" className="ml-2 text-sm text-gray-700">
                            フル管理者権限を付与する
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button
                        onClick={() => handleUpdate(driver.id!)}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                      >
                        保存
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="font-medium">{driver.name}</div>
                      <div className="text-sm text-gray-500">ドライバーID: {driver.driverId}</div>
                      <div className="text-sm text-gray-500">{driver.kana}</div>
                      <div className="text-sm text-gray-500">{driver.company} - {driver.employeeNo}</div>
                      <div className="text-sm text-gray-500">{driver.mail}</div>
                      
                      {/* Full Admin Status */}
                      {driver.fullAdmin && (
                        <div className="mt-1">
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                            フル管理者
                          </span>
                        </div>
                      )}
                      
                      {/* Expiration Date with Color Coding */}
                      <div className="text-sm mt-1">
                        <span className="text-gray-600">免許証有効期限: </span>
                        <span className={`font-medium ${
                          isExpirationSoon(driver.expirationDate) 
                            ? 'text-red-600 bg-red-50 px-2 py-1 rounded' 
                            : 'text-green-600 bg-green-50 px-2 py-1 rounded'
                        }`}>
                          {new Date(driver.expirationDate).toLocaleDateString('ja-JP')}
                          {isExpirationSoon(driver.expirationDate) && (
                            <span className="ml-2 text-xs">(3ヶ月以内に期限切れ)</span>
                          )}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(driver)}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(driver.id!)}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDriverManagement; 