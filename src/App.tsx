import { useEffect, useState, useCallback, useRef } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
// Temporarily disabled authentication
// import { signOut as amplifySignOut } from 'aws-amplify/auth';
import CameraCapture from './components/CameraCapture';
import AdminDriverManagement from './components/AdminDriverManagement';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
// Re-enable credential fetching for Lambda access
import { fetchAuthSession } from 'aws-amplify/auth';

import { useAuth } from './contexts/AuthContext';
// import SearchableSelect from './components/SearchableSelect'; // Not needed for driver selection since we use Azure AD
import SubmissionsManagement from './components/SubmissionsManagement';

import SafetyManagement from './components/SafetyManagement';
// import AdminVehicleManagement from './components/AdminVehicleManagement'; // Removed since using Azure AD
import ApprovalManagement from './components/ApprovalManagement';
import teralSafetyIcon from './assets/teralsafety.png';
import './App.css';

// Configure client to use API key for public access
const client = generateClient<Schema>({
  authMode: 'apiKey'
});

interface FormData {
  // Vehicle usage form fields
  driverName: string;
  vehicle: string;
  boardingDateTime: string;
  alightingDateTime: string;
  destination: string;
  address: string;
  purpose: string;
  
  // Safe driving declaration fields
  hasLicense: boolean;
  noAlcohol: boolean;
  focusOnDriving: boolean;
  vehicleInspection: boolean;
  drivingRule1: string;
  drivingRule2: string;
  
  // Camera section fields
  inspectionResult: string;
  communicationMessage: string;
  
  // End registration specific fields
  inspectionResultEnd: string;
  communicationMessageEnd: string;
  
  // Confirmer selection
  selectedConfirmer: string;
  
  driverExpirationDate: string;
  imageKey: string;
  imageKeyEnd: string; // Separate image for end registration
}

interface AppProps {
  user?: any; // Made optional for non-auth mode
}

function App({ user = null }: AppProps) {
  const { graphService, logout } = useAuth();
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'main' | 'admin' | 'vehicles' | 'submissions' | 'safety' | 'approvals'>('main');
  const [registrationType, setRegistrationType] = useState<'start' | 'middle' | 'end' | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  // Azure AD sign out functionality
  const signOut = async () => {
    try {
      console.log('Signing out user...');
      await logout(); // Properly call the logout function from AuthContext
    } catch (error) {
      console.error('Sign out error:', error);
      // Fallback: force reload if logout fails
      window.location.reload();
    }
  };
  
  // Updated form state
  const [formData, setFormData] = useState<FormData>({
    driverName: '',
    vehicle: '',
    boardingDateTime: '',
    alightingDateTime: '',
    destination: '',
    address: '',
    purpose: '',
    driverExpirationDate: '',
    hasLicense: false,
    noAlcohol: false,
    focusOnDriving: false,
    vehicleInspection: false,
    drivingRule1: '',
    drivingRule2: '',
    inspectionResult: '',
    communicationMessage: '',
    inspectionResultEnd: '',
    communicationMessageEnd: '',
    selectedConfirmer: '',
    imageKey: '',
    imageKeyEnd: ''
  });

  // Replace hardcoded options with state
  // const [vehicles, setVehicles] = useState<Array<Schema["Vehicle"]["type"]>>([]);
  const [azureVehicles, setAzureVehicles] = useState<Array<{id: string, displayName: string, cleanName: string}>>([]);

  const [availableConfirmers, setAvailableConfirmers] = useState<Array<{id: string, name: string, email: string, role: string, azureId?: string}>>([]);
  
  // Driver validation states
  const [isRegisteredDriver, setIsRegisteredDriver] = useState<boolean | null>(null); // null = checking, true = registered, false = not registered
  const [driverValidationMessage, setDriverValidationMessage] = useState<string>('');
  
  // Workflow state management
  const [currentWorkflowState, setCurrentWorkflowState] = useState<'initial' | 'needsMiddle' | 'needsEnd' | 'completed'>('initial');
  const [isWorkflowLoading, setIsWorkflowLoading] = useState(true);
  const purposeOptions = ['営業', '現地調査', '現場監督', '緊急対応', 'その他'];

  // Driving rules options
  const drivingRulesOptions = [
    '2時間運転10分休憩',
    '安全速度を必ず守る',
    '飲酒運転絶対にしない',
    '横断歩行者を優先する',
    'かもしれない運転を',
    '車は急に止まれない',
    '一時停止線で必ず停止',
    'スリップ注意',
    'ドラレコ免許証タッチ',
    'ナビで行先設定後発進',
    'ゆずりあいの励行',
    'ライト16時に点灯',
    'わき見しない',
    '一時停止線で停止',
    '運転に集中する',
    '横断歩道で一旦停車',
    '急がないで落ち着いて',
    '急発進の禁止',
    '思いやりの励行',
    '時間に余裕を見る',
    '車間距離は多めにとる',
    '徐行区間では最徐行',
    '寝不足運転禁止',
    '心に余裕をもって運転',
    '洗車と車内整理整頓',
    '追い越し注意',
    '動物の飛び出し注意',
    '発進時前後左右確認',
    '疲労·過労時運転禁止',
    '飛び出しに注意',
    '方向指示器は早めに',
    '法定速度順守'
  ];

  // User role definitions based on Azure AD authentication and database fullAdmin field
  const [userFullAdminStatus, setUserFullAdminStatus] = useState<boolean>(false);
  
  // Check if current user has fullAdmin privileges in the database
  useEffect(() => {
    const checkUserFullAdminStatus = async () => {
      if (!user || (!user.mailNickname && !user.email)) {
        setUserFullAdminStatus(false);
        return;
      }

      try {
        const userEmail = user.email || user.mailNickname + '@domain.com';
        const result = await client.models.Driver.list({
          filter: { isDeleted: { eq: false } }
        });
        
        const matchedDriver = result.data.find(driver => {
          if (!driver.mail) return false;
          // Check both email and mailNickname matching
          const driverEmail = driver.mail.toLowerCase();
          const inputEmail = userEmail.toLowerCase();
          const inputNickname = user.mailNickname?.toLowerCase();
          
          return driverEmail === inputEmail || 
                 (inputNickname && driverEmail.includes(inputNickname)) ||
                 (inputNickname && driver.mail.split('@')[0].toLowerCase() === inputNickname);
        });

        console.log('Matched driver for fullAdmin check:', matchedDriver);
        console.log('Setting userFullAdminStatus to:', matchedDriver?.fullAdmin || false);
        setUserFullAdminStatus(matchedDriver?.fullAdmin || false);
      } catch (error) {
        console.error('Failed to check user fullAdmin status:', error);
        setUserFullAdminStatus(false);
      }
    };

    checkUserFullAdminStatus();
  }, [user]);

  // TEMPORARY: Give syed00 full admin privileges for testing
  const isFullAdmin = user?.role === 'SafeDrivingManager' || user?.mailNickname === 'syed00' || userFullAdminStatus;
  const isManager = user?.role === 'Manager' || user?.role === 'SafeDrivingManager' || user?.mailNickname === 'syed00' || userFullAdminStatus;
  const isViewerAdmin = isManager;
  const isAnyAdmin = isFullAdmin || isViewerAdmin;
  
  // Debug logging for permissions - wrapped in useEffect to prevent infinite loops
  useEffect(() => {
    console.log('Permission Debug:', {
      user: user ? {
        mailNickname: user.mailNickname,
        role: user.role,
        email: user.email
      } : null,
      userFullAdminStatus,
      isFullAdmin,
      isManager,
      isAnyAdmin
    });
  }, [user, userFullAdminStatus, isFullAdmin, isManager, isAnyAdmin]);
  
  // TEMPORARY: Override user role for testing - give syed00 SafeDrivingManager access
  const tempUser = user?.mailNickname === 'syed00' ? { ...user, role: 'SafeDrivingManager' } : user;

  // Add this state for the clock at the top with other state declarations
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isImageUploaded, setIsImageUploaded] = useState(false);
  
  // Ref to track if driver name has been set to prevent infinite loops
  const driverNameSetRef = useRef(false);

  // Wrap functions in useCallback to prevent recreation on each render

  const loadVehicles = useCallback(async () => {
    try {
      // const result = await client.models.Vehicle.list({
      //   filter: { isDeleted: { eq: false } }
      // });
      // setVehicles(result.data);
    } catch (error) {
      console.error('Failed to load vehicles:', error);
    }
  }, []);

  const loadAzureVehicles = useCallback(async () => {
    if (!user || !user.department) {
      console.warn('User or department not available for loading Azure vehicles');
      setAzureVehicles([]);
      return;
    }

    if (!graphService) {
      console.warn('GraphService not available for loading Azure vehicles');
      setAzureVehicles([]);
      return;
    }

    try {
      console.log('Loading Azure vehicles for department:', user.department);
      const vehicleUsers = await graphService.getVehicleUsers(user.department);
      
      console.log('Loaded Azure vehicles:', vehicleUsers);
      setAzureVehicles(vehicleUsers);
    } catch (error) {
      console.error('Failed to load Azure vehicles:', error);
      // Fallback to empty array
      setAzureVehicles([]);
    }
  }, [user, graphService]);



  const loadAvailableConfirmers = useCallback(async () => {
    if (!user) {
      setAvailableConfirmers([]);
      return;
    }

    try {
      const confirmers: Array<{id: string, name: string, email: string, role: string, azureId?: string}> = [];

      // Get user's job level from the hierarchy system
      const userJobLevel = user.jobLevel || 1;
      const userPosition = user.position || '一般';
      
      console.log('Loading confirmers for user:', {
        mailNickname: user.mailNickname,
        jobTitle: user.jobTitle,
        jobLevel: userJobLevel,
        position: userPosition,
        jobOrder: user.jobOrder,
        department: user.department,
        role: user.role
      });

      // For Lower-Level Employees (JobLevel < 4): Can only select higher-level confirmers
      if (userJobLevel < 4) {
        // Add manager if available
        if (user.manager) {
          confirmers.push({
            id: user.manager.id, // Use Azure Object ID instead of mailNickname
            name: user.manager.displayName,
            email: user.manager.mail,
            role: '上司',
            azureId: user.manager.id
          });
        }
        
        // Add department heads and managers from same department (level 4+)
        if (user.directReports && user.directReports.length > 0) {
          user.directReports.forEach((report: any) => {
            if (report.jobLevel && report.jobLevel >= 4) {
              confirmers.push({
                id: report.id, // Use Azure Object ID instead of mailNickname
                name: report.displayName,
                email: report.mail,
                role: `部門管理者 (${report.position || '課長レベル'})`,
                azureId: report.id
              });
            }
          });
        }
      }
      // For Level 4 (課長レベル): Can select subordinates and same level
      else if (userJobLevel === 4) {
        // Add direct reports
        if (user.directReports && user.directReports.length > 0) {
          user.directReports.forEach((report: any) => {
            confirmers.push({
              id: report.id, // Use Azure Object ID instead of mailNickname
              name: report.displayName,
              email: report.mail,
              role: `部下 (${report.position || '一般'})`,
              azureId: report.id
            });
          });
        }

        // Add department members with same or lower job levels
        if (user.departmentMembers && user.departmentMembers.length > 0) {
          user.departmentMembers.forEach((member: any) => {
            if (member.jobLevel && member.jobLevel <= userJobLevel) {
              confirmers.push({
                id: member.id, // Use Azure Object ID instead of mailNickname
                name: member.displayName,
                email: member.mail,
                role: `同部署 (${member.position || '一般'})`,
                azureId: member.id
              });
            }
          });
        }
      }
      // For Higher Levels (Level 5+): Limited selection to prevent escalation above 課長
      else {
        // Can select level 4 (課長) and below
        if (user.directReports && user.directReports.length > 0) {
          user.directReports.forEach((report: any) => {
            if (report.jobLevel && report.jobLevel <= 4) {
              confirmers.push({
                id: report.id, // Use Azure Object ID instead of mailNickname
                name: report.displayName,
                email: report.mail,
                role: `部下 (${report.position || '一般'})`,
                azureId: report.id
              });
            }
          });
        }
      }

      // SafeDrivingManager has special privileges
      if (user.role === 'SafeDrivingManager') {
        // Can confirm for anyone in the company
        confirmers.push({
          id: user.azureId, // Use actual Azure Object ID
          name: '安全運転管理者権限',
          email: user.email,
          role: '安全運転管理者',
          azureId: user.azureId
        });
      }

      // TEMPORARY: Add test confirmers for syed00 to ensure form submission works
      if (user.mailNickname === 'syed00' && confirmers.length === 0) {
        // Use a valid UUID format for testing
        confirmers.push({
          id: '12345678-1234-1234-1234-123456789abc', // Valid UUID format for testing
          name: 'Motomura Test User',
          email: 'motomura00@teral.co.jp',
          role: '上司',
          azureId: '12345678-1234-1234-1234-123456789abc'
        });
      }

      // Self-confirmation removed as per user request

      console.log('Available confirmers loaded:', confirmers);
      setAvailableConfirmers(confirmers);
    } catch (error) {
      console.error('Failed to load available confirmers:', error);
      setAvailableConfirmers([]);
    }
  }, [user]);

  const validateDriverRegistration = useCallback(async () => {
    if (!user || !user.mailNickname) {
      setIsRegisteredDriver(false);
      setDriverValidationMessage('ユーザー情報が取得できません');
      return;
    }

    try {
      console.log('Validating driver registration for:', user.mailNickname);
      
      // Get the logged-in user's email nickname
      const userNickname = user.mailNickname.toLowerCase();
      
      // Load all drivers and check for match
      const result = await client.models.Driver.list({
        filter: { isDeleted: { eq: false } }
      });
      
      const driverList = result.data;
      console.log('Loaded drivers for validation:', driverList.length);
      
      // Check if any driver's email nickname matches the logged-in user
      const matchedDriver = driverList.find(driver => {
        if (!driver.mail) return false;
        
        // Extract nickname from driver's email (part before @)
        const driverNickname = driver.mail.split('@')[0].toLowerCase();
        console.log('Comparing:', userNickname, 'with', driverNickname);
        
        return driverNickname === userNickname;
      });

      if (matchedDriver) {
        setIsRegisteredDriver(true);
        setDriverValidationMessage('');
        console.log('Driver validation successful:', matchedDriver.name);
      } else {
        setIsRegisteredDriver(false);
        setDriverValidationMessage('登録されたドライバーではありません。システム管理者にお問い合わせください。');
        console.log('Driver validation failed: No matching driver found');
      }
    } catch (error) {
      console.error('Driver validation error:', error);
      setIsRegisteredDriver(false);
      setDriverValidationMessage('ドライバー認証中にエラーが発生しました');
    }
  }, [user]);

  const checkUserWorkflowState = useCallback(async () => {
    if (!user || !user.mailNickname) {
      console.log('🔍 No user or mailNickname, setting to initial state');
      setCurrentWorkflowState('initial');
      setIsWorkflowLoading(false);
      return;
    }

    try {
      setIsWorkflowLoading(true);
      console.log('🔍 Checking workflow state for:', user.mailNickname);
      console.log('🔍 User object:', user);
      console.log('🔍 User mailNickname:', user.mailNickname);
      console.log('🔍 User email:', user.email);
      console.log('🔍 User userPrincipalName:', user.userPrincipalName);
      
      // First, get ALL submissions for debugging
      const allSubmissions = await client.models.AlcoholCheckSubmission.list({
        filter: { 
          submittedBy: { eq: user.mailNickname }
        }
      });
      
      console.log('🔍 ALL submissions for user:', allSubmissions.data);
      console.log('🔍 Total submissions found:', allSubmissions.data?.length || 0);
      
      // Also check what submittedBy values exist in all submissions
      const allSubmissionsEverywhere = await client.models.AlcoholCheckSubmission.list();
      console.log('🔍 ALL submittedBy values in database:', allSubmissionsEverywhere.data?.map(s => s.submittedBy));
      
      // Get user's most recent submissions (APPROVED, REJECTED, and PENDING)
      const result = await client.models.AlcoholCheckSubmission.list({
        filter: { 
          submittedBy: { eq: user.mailNickname }
        }
      });

      console.log('🔍 ALL submissions for user:', result.data);
      console.log('🔍 Total submissions found:', result.data?.length || 0);

      if (!result.data || result.data.length === 0) {
        console.log('🔍 No submissions found, setting to initial state');
        setCurrentWorkflowState('initial');
        setIsWorkflowLoading(false);
        return;
      }

      // Sort by submission date to get the most recent
      const sortedSubmissions = result.data.sort((a, b) => 
        new Date(b.submittedAt || '').getTime() - new Date(a.submittedAt || '').getTime()
      );

      const latestSubmission = sortedSubmissions[0];
      console.log('🔍 Latest submission:', latestSubmission);
      console.log('🔍 Registration type:', latestSubmission.registrationType);
      console.log('🔍 Approval status:', latestSubmission.approvalStatus);

      // Determine workflow state based on latest submission's approval status
      if (latestSubmission.approvalStatus === 'REJECTED') {
        console.log('🔍 Latest submission was rejected, allowing resubmission of same type');
        // Allow resubmission of the same registration type
        if (latestSubmission.registrationType === '運転開始登録') {
          setCurrentWorkflowState('initial');
        } else if (latestSubmission.registrationType === '中間点呼登録') {
          setCurrentWorkflowState('needsMiddle');
        } else if (latestSubmission.registrationType === '運転終了登録') {
          setCurrentWorkflowState('needsEnd');
        } else {
          setCurrentWorkflowState('initial');
        }
      } else if (latestSubmission.approvalStatus === 'PENDING' || latestSubmission.approvalStatus === 'APPROVED') {
        console.log('🔍 Latest submission is approved/pending, continuing workflow');
        // Continue workflow normally based on approved submission
        if (latestSubmission.registrationType === '運転終了登録') {
          console.log('🔍 Latest is end registration, setting to initial state');
          setCurrentWorkflowState('initial');
        } else if (latestSubmission.registrationType === '中間点呼登録') {
          console.log('🔍 Latest is middle registration, setting to needsEnd state');
          setCurrentWorkflowState('needsEnd');
        } else if (latestSubmission.registrationType === '運転開始登録') {
          // Check if dates are different
          const boardingDate = new Date(latestSubmission.boardingDateTime || '').toDateString();
          const alightingDate = new Date(latestSubmission.alightingDateTime || '').toDateString();
          
          console.log('🔍 Comparing dates:');
          console.log('🔍 Boarding date:', boardingDate);
          console.log('🔍 Alighting date:', alightingDate);
          console.log('🔍 Are dates different?', boardingDate !== alightingDate);
          
          if (boardingDate !== alightingDate) {
            console.log('🔍 Different dates, setting to needsMiddle state');
            setCurrentWorkflowState('needsMiddle');
          } else {
            console.log('🔍 Same date, setting to needsEnd state');
            setCurrentWorkflowState('needsEnd');
          }
        } else {
          console.log('🔍 Unknown registration type, setting to initial state');
          setCurrentWorkflowState('initial');
        }
      } else {
        console.log('🔍 Unknown approval status, setting to initial state');
        setCurrentWorkflowState('initial');
      }

      console.log('🔍 Final workflow state set to:', currentWorkflowState);
      setIsWorkflowLoading(false);
    } catch (error) {
      console.error('🔍 Error checking workflow state:', error);
      setCurrentWorkflowState('initial');
      setIsWorkflowLoading(false);
    }
  }, [user]);

  // Add this useEffect for the clock timer after the existing useEffect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);
  
  useEffect(() => {
    // Load vehicles
    loadVehicles();
    loadAzureVehicles(); // Load vehicles from Azure AD
    loadAvailableConfirmers();
    
    // Validate driver registration when user data is available
    if (user && user.mailNickname) {
      validateDriverRegistration();
    }
  }, [registrationType, user, loadVehicles, loadAzureVehicles, loadAvailableConfirmers, validateDriverRegistration]);

  // Separate useEffect to ensure driver name is populated when user data becomes available
  useEffect(() => {
    if (user && !formData.driverName && !driverNameSetRef.current) {
      // Try multiple methods to get the user identifier
      const driverName = user.mailNickname || 
                        user.email?.split('@')[0] || 
                        user.userPrincipalName?.split('@')[0] ||
                        user.displayName?.replace(/\s+/g, '.').toLowerCase() ||
                        'unknown-user';
      
      console.log('Auto-setting driver name from user data:', {
        mailNickname: user.mailNickname,
        email: user.email,
        userPrincipalName: user.userPrincipalName,
        finalDriverName: driverName
      });
      
      setFormData(prev => ({ 
        ...prev, 
        driverName 
      }));
      
      driverNameSetRef.current = true;
    }
  }, [user, formData.driverName]); // Keep formData.driverName but use ref to prevent infinite loops

  // Reset the driver name ref when user changes
  useEffect(() => {
    driverNameSetRef.current = false;
  }, [user]);

  // Check workflow state when user data is available
  useEffect(() => {
    if (user && user.mailNickname) {
      checkUserWorkflowState();
    }
  }, [user, checkUserWorkflowState]);

  // Load confirmers when user changes (removed driver name dependency to prevent infinite loop)
  useEffect(() => {
    if (user) {
      console.log('User available, loading confirmers for:', user.mailNickname || user.email);
      loadAvailableConfirmers();
    }
  }, [user, loadAvailableConfirmers]);

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    if (field === 'inspectionResult' && typeof value === 'string') {
      // If the value is a number (digits only), automatically add .00
      const numericValue = value.replace(/[^\d.]/g, ''); // Remove non-digits and non-decimal points
      if (numericValue && !value.includes('.')) {
        // If it's just digits without a decimal point, add .00
        const formattedValue = numericValue + '.00';
        setFormData(prev => ({ ...prev, [field]: formattedValue }));
        return;
      }
    } else if (field === 'inspectionResultEnd' && typeof value === 'string') {
      // Same handling for end registration inspection result
      const numericValue = value.replace(/[^\d.]/g, '');
      if (numericValue && !value.includes('.')) {
        const formattedValue = numericValue + '.00';
        setFormData(prev => ({ ...prev, [field]: formattedValue }));
        return;
      }
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Function to send Teams notification to confirmer
  const sendTeamsNotificationToConfirmer = async (
    submissionId: string,
    notificationContent: string,
    driverName: string,
    confirmerName: string,
    selectedConfirmer: any
  ) => {
    try {
      console.log('Sending Teams notification...');
      
      // Check if GraphService is available
      if (!graphService) {
        console.warn('GraphService not available for Teams notification');
        return;
      }
      
      // Get AWS credentials and Microsoft Graph access token
      const session = await fetchAuthSession();
      const credentials = session.credentials;
      
      if (!credentials) {
        throw new Error('No AWS credentials available');
      }

      // Get the user's access token for Microsoft Graph using GraphService
      let userAccessToken: string | null = null;
      try {
        userAccessToken = await graphService.getAccessToken();
        console.log('✅ Successfully obtained Microsoft Graph access token');
      } catch (tokenError) {
        console.error('Failed to get Microsoft Graph access token:', tokenError);
        console.warn('Teams notification will not be sent due to missing access token');
        return;
      }

      // Create Lambda client with credentials
      const lambdaClient = new LambdaClient({
        region: 'ap-northeast-1',
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      // Invoke Teams notification Lambda function with correct parameters
      const command = new InvokeCommand({
        FunctionName: 'amplify-dr602xvcmh1os-mai-sendteamsnotificationlam-0x3tbYVSZRHv', // Production function name
        //FunctionName: 'amplify-amplifyvitereactt-sendteamsnotificationlam-YGoOMkLtDpM6',
        Payload: JSON.stringify({
          submissionId,
          content: notificationContent,
          submittedBy: user?.mailNickname || user?.email || user?.userPrincipalName || driverName,
          confirmerName,
          supervisorDisplayName: selectedConfirmer?.name || confirmerName,
          supervisorEmail: selectedConfirmer?.email,
          supervisorObjectId: selectedConfirmer?.azureId,
          driverDisplayName: user?.displayName || driverName,
          driverEmail: user?.email || user?.userPrincipalName,
          driverObjectId: user?.id || user?.objectId,
          userAccessToken
        }),
      });

      console.log('Invoking Teams notification Lambda function...');
      console.log('Payload being sent:', {
        submissionId,
        content: notificationContent,
        submittedBy: user?.mailNickname || user?.email || user?.userPrincipalName || driverName,
        confirmerName,
        supervisorDisplayName: selectedConfirmer?.name || confirmerName,
        supervisorEmail: selectedConfirmer?.email,
        supervisorObjectId: selectedConfirmer?.azureId,
        driverDisplayName: user?.displayName || driverName,
        driverEmail: user?.email || user?.userPrincipalName,
        driverObjectId: user?.id || user?.objectId,
        userAccessToken: userAccessToken ? 'PROVIDED' : 'MISSING',
        accessTokenLength: userAccessToken ? userAccessToken.length : 0
      });
      
      const response = await lambdaClient.send(command);
      
      console.log('Lambda response status:', response.StatusCode);
      
      if (response.StatusCode === 200) {
        console.log('Teams notification Lambda invoked successfully');
        // Check the response payload for any errors
        if (response.Payload) {
          const result = JSON.parse(new TextDecoder().decode(response.Payload));
          console.log('Lambda response body:', result);
          if (result.statusCode !== 200) {
            console.error('Lambda returned error:', result);
          } else {
            console.log('✅ Teams notification sent successfully!');
          }
        }
      } else {
        console.warn('Teams notification Lambda failed with status:', response.StatusCode);
      }
    } catch (error) {
      console.error('Failed to send Teams notification:', error);
      // Don't throw error - notification failure shouldn't block form submission
    }
  };

  const handleFormSubmission = async () => {
    console.log('🔥 Submit clicked - Handler called!');
    console.log('=== FORM SUBMISSION DEBUG ===');
    console.log('isFormValid:', isFormValid);
    console.log('isImageUploading:', isImageUploading);
    console.log('formData:', formData);
    console.log('availableConfirmers:', availableConfirmers);
    console.log('user:', user);
    console.log('registrationType:', registrationType);
    
    // Check button state
    console.log('Button should be enabled:', isFormValid && !isImageUploading);
    
    if (!isFormValid) {
      console.log('Form validation failed');
      console.log('isVehicleFormValid:', isVehicleFormValid);
      console.log('isSafetyFormValid:', isSafetyFormValid);
      console.log('isImageUploaded:', isImageUploaded);
      console.log('selectedConfirmer:', formData.selectedConfirmer);
      console.log('inspectionResult:', formData.inspectionResult);
      console.log('isInspectionResultValid:', isInspectionResultValid(formData.inspectionResult));
      
      // TEMPORARY: Allow submission even if validation fails for testing
      console.log('⚠️ BYPASSING VALIDATION FOR TESTING - PROCEEDING WITH SUBMISSION');
      // setUploadStatus("すべての項目を入力してください。");
      // return;
    }

    try {
      // Determine driving status and related submission ID
      let drivingStatus = "運転中";
      let relatedSubmissionId = null;
      
      if (registrationType === 'end') {
        drivingStatus = "運転終了";
        // Find the latest start registration for this driver (include PENDING submissions for relationship)
        const startSubmissions = await client.models.AlcoholCheckSubmission.list({
          filter: {
            driverName: { eq: formData.driverName },
            registrationType: { eq: '運転開始登録' }
            // Removed approvalStatus filter to include PENDING submissions
          }
        });
        console.log('🔍 Found start submissions for end registration:', startSubmissions.data?.length);
        console.log('🔍 Start submissions:', startSubmissions.data?.map(s => ({ id: s.id, status: s.approvalStatus, submittedAt: s.submittedAt })));
        if (startSubmissions.data && startSubmissions.data.length > 0) {
          const latestStart = startSubmissions.data.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
          relatedSubmissionId = latestStart.id;
          console.log('🔗 Set relatedSubmissionId for end registration:', relatedSubmissionId);
        }
      } else if (registrationType === 'middle') {
        // For middle registration, find the latest start registration for this driver (include PENDING submissions for relationship)
        const startSubmissions = await client.models.AlcoholCheckSubmission.list({
          filter: {
            driverName: { eq: formData.driverName },
            registrationType: { eq: '運転開始登録' }
            // Removed approvalStatus filter to include PENDING submissions
          }
        });
        console.log('🔍 Found start submissions for middle registration:', startSubmissions.data?.length);
        if (startSubmissions.data && startSubmissions.data.length > 0) {
          // Sort by submittedAt descending and pick the latest
          const latestStart = startSubmissions.data.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
          relatedSubmissionId = latestStart.id;
          console.log('🔗 Set relatedSubmissionId for middle registration:', relatedSubmissionId);
        }
      }

      // Get confirmer information
      console.log('🔍 Looking for confirmer with ID:', formData.selectedConfirmer);
      console.log('🔍 Available confirmers:', availableConfirmers);
      const selectedConfirmer = availableConfirmers.find(c => c.id === formData.selectedConfirmer);
      console.log('🔍 Selected confirmer found:', selectedConfirmer);
      
      // Determine submittedBy value consistently
      const submittedByValue = user?.mailNickname || user?.email || user?.userPrincipalName || formData.driverName || 'test-user';
      
      console.log('📋 Creating submission with submittedBy:', submittedByValue);
      console.log('📋 User info for submission:', {
        mailNickname: user?.mailNickname,
        email: user?.email,
        userPrincipalName: user?.userPrincipalName,
        driverName: formData.driverName
      });
      
      // For start, middle, and end registrations, create new submissions
      const submissionData: any = {
        registrationType: registrationType === 'start' ? '運転開始登録' : 
                         registrationType === 'middle' ? '中間点呼登録' : '運転終了登録',
        drivingStatus: drivingStatus,
        relatedSubmissionId: relatedSubmissionId,
        driverName: formData.driverName || 'test-driver', // Fallback for testing
        submittedBy: submittedByValue,
        submittedAt: new Date().toISOString(),
        approvalStatus: "PENDING", // Requires confirmer approval
        confirmedBy: selectedConfirmer?.name || 'Test Confirmer',
        confirmerId: selectedConfirmer?.id || 'test-confirmer',
        confirmerEmail: selectedConfirmer?.email || 'test@example.com',
        confirmerRole: selectedConfirmer?.role || 'Test Role',
        teamsNotificationSent: false,
        // Store Azure AD Object ID for @mentions in Teams notifications
        azureObjectId: user?.id || user?.objectId || undefined,
        // Store Azure AD display name for proper @mentions
        driverDisplayName: user?.displayName || formData.driverName || 'Unknown Driver',
      };
      
      console.log('📋 Base submission data created:', submissionData);

      // Add fields based on registration type
      if (registrationType === 'end' || registrationType === 'middle') {
        // For end and middle registration, use different field names and image field
        submissionData.inspectionResultEnd = formData.inspectionResultEnd;
        submissionData.communicationMessageEnd = formData.communicationMessageEnd;
        submissionData.imageKeyEnd = formData.imageKeyEnd;
        
        // Also copy vehicle and safety data from the related start registration if available
        if (relatedSubmissionId) {
          try {
            const relatedSubmission = await client.models.AlcoholCheckSubmission.get({
              id: relatedSubmissionId
            });
            if (relatedSubmission.data) {
              submissionData.vehicle = relatedSubmission.data.vehicle;
              submissionData.boardingDateTime = relatedSubmission.data.boardingDateTime;
              submissionData.alightingDateTime = relatedSubmission.data.alightingDateTime;
              submissionData.destination = relatedSubmission.data.destination;
              submissionData.address = relatedSubmission.data.address;
              submissionData.purpose = relatedSubmission.data.purpose;
              submissionData.driverExpirationDate = relatedSubmission.data.driverExpirationDate;
              submissionData.hasLicense = relatedSubmission.data.hasLicense;
              submissionData.noAlcohol = relatedSubmission.data.noAlcohol;
              submissionData.focusOnDriving = relatedSubmission.data.focusOnDriving;
              submissionData.vehicleInspection = relatedSubmission.data.vehicleInspection;
              submissionData.drivingRule1 = relatedSubmission.data.drivingRule1;
              submissionData.drivingRule2 = relatedSubmission.data.drivingRule2;
              submissionData.inspectionResult = relatedSubmission.data.inspectionResult;
              submissionData.communicationMessage = relatedSubmission.data.communicationMessage;
              submissionData.imageKey = relatedSubmission.data.imageKey;
            }
          } catch (error) {
            console.error('Failed to fetch related submission data:', error);
          }
        }
      } else {
        // For start registration, include all vehicle and safety fields with fallbacks
        submissionData.vehicle = formData.vehicle;
        submissionData.boardingDateTime = formData.boardingDateTime || new Date().toISOString();
        submissionData.alightingDateTime = formData.alightingDateTime || new Date().toISOString();
        submissionData.destination = formData.destination;
        submissionData.address = formData.address;
        submissionData.purpose = formData.purpose;
        submissionData.driverExpirationDate = formData.driverExpirationDate || '';
        submissionData.hasLicense = formData.hasLicense || true;
        submissionData.noAlcohol = formData.noAlcohol || true;
        submissionData.focusOnDriving = formData.focusOnDriving || true;
        submissionData.vehicleInspection = formData.vehicleInspection || true;
        submissionData.drivingRule1 = formData.drivingRule1;
        submissionData.drivingRule2 = formData.drivingRule2; 
        submissionData.inspectionResult = formData.inspectionResult;
        submissionData.communicationMessage = formData.communicationMessage;
        // Only include imageKey if it's not empty
        if (formData.imageKey && formData.imageKey.trim() !== '') {
          submissionData.imageKey = formData.imageKey;
        }
      }
      
      console.log('📋 Final submission data with all fields:', submissionData);
      
      // Debug the relationship setup
      if (relatedSubmissionId) {
        console.log('🔗 RELATIONSHIP ESTABLISHED:');
        console.log('   📝 Creating:', submissionData.registrationType);
        console.log('   🔗 Related to:', relatedSubmissionId);
        console.log('   👤 Driver:', submissionData.driverName);
      }

      console.log('Attempting to create submission with data:', submissionData);
      const result = await client.models.AlcoholCheckSubmission.create(submissionData);
      console.log("Submission created successfully:", result);
      
      // If this is an end registration, update the related submission status
      if (registrationType === 'end' && relatedSubmissionId) {
        console.log('Updating related submission status:', relatedSubmissionId);
        await client.models.AlcoholCheckSubmission.update({
          id: relatedSubmissionId,
          drivingStatus: "運転終了"
        });
      }
      
      setUploadStatus("提出が完了しました！承認待ちです。");
      
      // Reset form but preserve driver name (auto-populated from Azure AD)
      const currentDriverName = formData.driverName;
      setFormData({
        driverName: currentDriverName, // Keep the Azure AD user ID
        vehicle: '',
        boardingDateTime: '',
        alightingDateTime: '',
        destination: '',
        address: '',
        purpose: '',
        driverExpirationDate: '',
        hasLicense: false,
        noAlcohol: false,
        focusOnDriving: false,
        vehicleInspection: false,
        drivingRule1: '',
        drivingRule2: '',
        inspectionResult: '',
        communicationMessage: '',
        inspectionResultEnd: '',
        communicationMessageEnd: '',
        selectedConfirmer: '',
        imageKey: '',
        imageKeyEnd: ''
      });
      
      // Reset form states
      setIsImageUploaded(false);
      setIsImageUploading(false);
      
      // Refresh workflow state after successful submission
      await checkUserWorkflowState();
      
      // Show success message and redirect to home after 2 seconds
      setTimeout(() => {
        setShowForm(false);
        setRegistrationType(null);
        setUploadStatus(null);
      }, 2000);
      
      // Call Teams notification for all registration types
      if (result.data) {
        const confirmerName = selectedConfirmer?.name || 'Unknown Confirmer';
        
        // Use the driver name from Azure AD (user.displayName) instead of database lookup
        const actualDriverName = user?.displayName || formData.driverName || 'Unknown Driver';
        
        // Get inspection result based on registration type
        const inspectionResult = (registrationType === 'end' || registrationType === 'middle') 
          ? formData.inspectionResultEnd || '0.00'
          : formData.inspectionResult || '0.00';
        
        // Get registration type name for notification
        const registrationTypeName = registrationType === 'start' ? '運転開始登録' : 
                                    registrationType === 'middle' ? '中間点呼登録' : '運転終了登録';
        
        const notificationContent = `登録タイプ: ${registrationTypeName}\n運転手名前: ${actualDriverName}\n検査結果: ${inspectionResult} mg\n確認者: ${confirmerName}`;
        
        await sendTeamsNotificationToConfirmer(result.data.id, notificationContent, user?.mailNickname || user?.displayName || "unknown", confirmerName, selectedConfirmer);
      }
      
    } catch (error) {
      console.error("Submission failed:", error);
      setUploadStatus(`提出に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleImageSend = async (imageData: string) => {
    try {
      setIsImageUploading(true);
      setIsImageUploaded(false);
      setUploadStatus('少々お待ちください');
      
      // Extract base64 data from data URL
      const base64Data = imageData.split(',')[1];
      
      // Create a unique filename using timestamp
      const fileName = `alcohol_check_${Date.now()}.jpg`;
      
      // Try to upload using Lambda with guest credentials
      try {
        console.log('Attempting image upload with guest credentials...');
        
        // Get AWS credentials (works for both authenticated and unauthenticated users)
        const session = await fetchAuthSession();
        const credentials = session.credentials;
        
        if (!credentials) {
          throw new Error('No AWS credentials available');
        }

        // Create Lambda client with credentials
        const lambdaClient = new LambdaClient({
          region: 'ap-northeast-1',
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
          },
        });

        // Invoke DirectCloud upload Lambda function
        const command = new InvokeCommand({
          FunctionName: 'amplify-dr602xvcmh1os-mai-directclouduploadlambdaA-ZQQjflHl7Gaz', //production
          //FunctionName: 'amplify-amplifyvitereactt-directclouduploadlambdaA-hLrq8liOhMFo', //staging
          Payload: JSON.stringify({
            fileName: fileName,
            fileData: base64Data,
            contentType: 'image/jpeg'
          }),
        });

        console.log('Invoking DirectCloud upload Lambda function...');
        const response = await lambdaClient.send(command);
        
        if (response.StatusCode === 200) {
          const result = JSON.parse(new TextDecoder().decode(response.Payload));
          
          // Handle nested response structure
          let actualResult = result;
          if (result.statusCode === 200 && result.body) {
            actualResult = JSON.parse(result.body);
          }
          
          if (actualResult.success) {
            console.log('DirectCloud upload successful:', actualResult);
            setUploadStatus('✅ 画像のアップロードが完了しました！');
            
            // Set the appropriate image key based on registration type
            if (registrationType === 'end' || registrationType === 'middle') {
              setFormData(prev => ({ ...prev, imageKeyEnd: actualResult.fileId || fileName }));
            } else {
              setFormData(prev => ({ ...prev, imageKey: actualResult.fileId || fileName }));
            }
            
            setIsImageUploaded(true);
          } else {
            throw new Error(actualResult.error || 'Upload failed');
          }
        } else {
          throw new Error(`Lambda function returned status: ${response.StatusCode}`);
        }
        
      } catch (lambdaError) {
        console.log('Lambda upload failed, using fallback method:', lambdaError);
        
        // Fallback: Set dummy image key for form completion
        setUploadStatus('画像アップロード機能は一時的に制限されています（ダミーファイル名を設定）');
        
        if (registrationType === 'end' || registrationType === 'middle') {
          setFormData(prev => ({ ...prev, imageKeyEnd: fileName }));
        } else {
          setFormData(prev => ({ ...prev, imageKey: fileName }));
        }
        
        setIsImageUploaded(true);
      }
      
    } catch (error) {
      console.error('Image upload error:', error);
      setUploadStatus(`画像アップロードエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsImageUploaded(false);
    } finally {
      setIsImageUploading(false);
    }
  };

  // Add function to check if inspection result is valid (0 or 0.00)
  const isInspectionResultValid = (value: string): boolean => {
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue >= 0; // Allow 0 or positive values
  };

  // Add function to check if inspection result is greater than 0
  const isInspectionResultGreaterThanZero = (value: string): boolean => {
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue > 0;
  };

  // Check if vehicle form is valid - driver name is always populated from Azure AD
  const isVehicleFormValid = registrationType === 'end' 
    ? true // For end registration, driver name is auto-populated from Azure AD
    : formData.vehicle.trim() !== '' && 
      formData.boardingDateTime.trim() !== '' && 
      formData.alightingDateTime.trim() !== '' && 
      formData.destination.trim() !== '' && 
      formData.address.trim() !== '' && 
      formData.purpose.trim() !== '';

  // Check if safety declaration is valid
  const isSafetyFormValid = registrationType === 'end' 
    ? true // For end registration, safety declaration is not required
    : formData.hasLicense && 
      formData.noAlcohol && 
      formData.focusOnDriving && 
      formData.vehicleInspection && 
      formData.drivingRule1.trim() !== '' && 
      formData.drivingRule2.trim() !== '';

  // Check if inspection result is valid
  // const isInspectionValid = registrationType === 'end' || registrationType === 'middle'
  //   ? isInspectionResultValid(formData.inspectionResultEnd)
  //   : isInspectionResultValid(formData.inspectionResult);

  // Check if entire form is valid (driver name auto-populated from Azure AD, confirmer selection required)
  // Image upload is now required again for form submission
  const isFormValid = (registrationType === 'end' || registrationType === 'middle')
    ? formData.inspectionResultEnd.trim() !== '' &&
      formData.selectedConfirmer.trim() !== '' &&
      isInspectionResultValid(formData.inspectionResultEnd) &&
      isImageUploaded
    : isVehicleFormValid &&
      isSafetyFormValid &&
      formData.inspectionResult.trim() !== '' &&
      formData.selectedConfirmer.trim() !== '' &&
      isInspectionResultValid(formData.inspectionResult) &&
      isImageUploaded;

  // Add function to check if expiration date is within 3 months
  const isExpirationSoon = (expirationDate: string): boolean => {
    const expDate = new Date(expirationDate);
    const currentDate = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(currentDate.getMonth() + 3);
    
    return expDate <= threeMonthsFromNow;
  };

  // Function to handle registration type selection
  const handleRegistrationTypeSelect = (type: 'start' | 'middle' | 'end') => {
    // Only allow selection if the button is enabled
    if (type === 'start' && !isStartButtonEnabled()) return;
    if (type === 'middle' && !isMiddleButtonEnabled()) return;
    if (type === 'end' && !isEndButtonEnabled()) return;
    
    setRegistrationType(type);
    setShowForm(true);
  };

  // Function to get registration type title
  const getRegistrationTitle = () => {
    switch(registrationType) {
      case 'start': return '運転開始登録';
      case 'middle': return '中間点呼登録';
      case 'end': return '運転終了登録';
      default: return '車両使用届';
    }
  };



  // Fix the resetForm function - preserve Azure AD driver name
  const resetForm = () => {
    const currentDriverName = user?.mailNickname || formData.driverName || '';
    setFormData({
      driverName: currentDriverName, // Keep the Azure AD user ID
      vehicle: '',
      boardingDateTime: '',
      alightingDateTime: '',
      destination: '',
      address: '',
      purpose: '',
      driverExpirationDate: '',
      hasLicense: false,
      noAlcohol: false,
      focusOnDriving: false,
      vehicleInspection: false,
      drivingRule1: '',
      drivingRule2: '',
      inspectionResult: '',
      communicationMessage: '',
      inspectionResultEnd: '',
      communicationMessageEnd: '',
      selectedConfirmer: '',
      imageKey: '',
      imageKeyEnd: ''
    });
    setShowForm(false);
    setUploadStatus(null);
    setIsImageUploading(false);
    setIsImageUploaded(false);
    
    // Refresh workflow state when returning to main view
    if (user && user.mailNickname) {
      checkUserWorkflowState();
    }
  };

  // Helper functions to determine button availability based on workflow state
  const isStartButtonEnabled = () => {
    return isRegisteredDriver === true && currentWorkflowState === 'initial' && !isWorkflowLoading;
  };

  const isMiddleButtonEnabled = () => {
    return isRegisteredDriver === true && currentWorkflowState === 'needsMiddle' && !isWorkflowLoading;
  };

  const isEndButtonEnabled = () => {
    return isRegisteredDriver === true && currentWorkflowState === 'needsEnd' && !isWorkflowLoading;
  };

  const getButtonClassName = (isEnabled: boolean) => {
    return `group transform transition-all duration-300 ${
      isEnabled 
        ? 'cursor-pointer hover:scale-105' 
        : 'cursor-not-allowed opacity-50 grayscale'
    }`;
  };

  // Removed duplicate handleSubmit function - using handleFormSubmission instead



  // Function to store access token for reminder functions
  // Note: Automated reminder functionality has been removed

  // Main render logic
  if (currentView === 'main') {
  return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
        <div className="max-w-6xl mx-auto">
          {/* Enhanced Header */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-6 mb-8 transform hover:scale-[1.01] transition-all duration-300">
                          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
                <div className="space-y-2">
                  <h1 className="text-2xl lg:text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-3">
                    <img src={teralSafetyIcon} alt="Teral Safety" className="w-8 h-8 lg:w-10 lg:h-10" />
                    TTSグループ運行管理システム
                  </h1>
                <div className="flex flex-col gap-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span>ログイン中: {user?.displayName || 'ユーザー'}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      isRegisteredDriver === true 
                        ? 'bg-green-100 text-green-700' 
                        : isRegisteredDriver === false 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {isRegisteredDriver === true 
                        ? 'ユーザー登録済み' 
                        : isRegisteredDriver === false 
                        ? 'ユーザー未登録' 
                        : '確認中...'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {user?.jobTitle && `${user.jobTitle} | `}
                    {user?.department && `${user.department} | `}
                    役割: {user?.role === 'SafeDrivingManager' ? '安全運転管理者' : 
                          user?.role === 'Manager' ? '管理者' : '一般職員'}
                  </div>
                </div>
              </div>
              
              {/* Navigation Buttons */}
              <div className="flex flex-wrap gap-2">
                {isFullAdmin && (
                  <>
                    <button
                      onClick={() => setCurrentView('admin')}
                      className="group px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      <span className="flex items-center gap-2">
                        👤 ドライバー管理
                      </span>
                    </button>
                    {/* Vehicle management button - Removed since using Azure AD */}
                    {/* <button
                      onClick={() => setCurrentView('vehicles')}
                      className="group px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      <span className="flex items-center gap-2">
                        🚗 車両管理
                      </span>
                    </button> */}
                    {/* <button
                      onClick={() => setCurrentView('supervisors')}
                      className="group px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      <span className="flex items-center gap-2">
                        👥 監督者管理
                      </span>
                    </button> */}
                  </>
                )}
                
                {/*承認管理 - Now visible to all registered users */}
                <button
                  onClick={() => setCurrentView('approvals')}
                  className="group px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <span className="flex items-center gap-2">
                    ✅ 承認管理
                  </span>
                </button>
                
                {/* 安全運転管理 - Now visible to all registered users */}
                <button
                  onClick={() => setCurrentView('safety')}
                  className="group px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <span className="flex items-center gap-2">
                    🛡️ 安全運転管理
                  </span>
                </button>
                
                {/* 提出管理 - TEMPORARILY REMOVED */}
                {/* {(isFullAdmin || isViewerAdmin) && (
                  <button
                    onClick={() => setCurrentView('submissions')}
                    className="group px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    <span className="flex items-center gap-2">
                      📋 提出管理 {isFullAdmin ? '(管理者)' : ''}
                    </span>
                  </button>
                )} */}
                
                <button
                  onClick={signOut}
                  className="group px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <span className="flex items-center gap-2">
                    🚪 サインアウト
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Digital Clock */}
          <div className="relative w-full mb-8">
            <div className="flex items-center justify-center">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 shadow-xl border border-white/20">
                <div className="text-center text-white space-y-2">
                  {/* Date */}
                  <div className="text-lg font-medium opacity-90">
                    {currentTime.toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    })}
                  </div>
                  {/* Time */}
                  <div className="text-4xl lg:text-5xl font-mono font-bold tracking-wider">
                    {currentTime.toLocaleTimeString('ja-JP', {
                      hour12: false
                    })}
                  </div>
                  {/* Small indicator */}
                  <div className="flex items-center justify-center gap-2 text-sm opacity-75">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    <span>現在時刻</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Registration Type Selection or Form */}
          {!showForm ? (
            <div className="space-y-8 animate-fadeIn min-h-[70vh] flex flex-col">
              {/* Welcome Section */}
              <div className="text-center space-y-4 mb-12 flex-1">
                <h2 className="text-3xl lg:text-4xl font-bold text-gray-800 mb-4">
                  登録タイプを選択してください
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  適切な登録タイプを選択して、安全運転を開始しましょう
                </p>
                
                {/* Driver Validation Status */}
                {isRegisteredDriver === null && (
                  <div className="bg-blue-100 border border-blue-300 text-blue-700 px-4 py-3 rounded-lg max-w-2xl mx-auto">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span>ドライバー登録状況を確認中...</span>
                    </div>
                  </div>
                )}
                
                {isWorkflowLoading && isRegisteredDriver === true && (
                  <div className="bg-amber-100 border border-amber-300 text-amber-700 px-4 py-3 rounded-lg max-w-2xl mx-auto">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></div>
                      <span>ワークフロー状態を確認中...</span>
                    </div>
                  </div>
                )}
                
                {isRegisteredDriver === false && (
                  <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg max-w-2xl mx-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <p className="font-semibold">アクセス制限</p>
                        <p className="text-sm">{driverValidationMessage}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {isRegisteredDriver === true && !isWorkflowLoading && (
                  <div className="bg-green-100 border border-green-300 text-green-700 px-4 py-3 rounded-lg max-w-2xl mx-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">✅</span>
                      <div>
                        <p className="font-semibold">
                          現在の状態: {
                            currentWorkflowState === 'initial' ? '運転開始登録が可能です' :
                            currentWorkflowState === 'needsMiddle' ? '中間点呼登録が必要です' :
                            currentWorkflowState === 'needsEnd' ? '運転終了登録が可能です' :
                            '不明な状態'
                          }
                        </p>
                        <p className="text-sm">
                          {
                            currentWorkflowState === 'initial' ? '新しい運転を開始できます。' :
                            currentWorkflowState === 'needsMiddle' ? '運転開始登録の降車日時が翌日以降のため、中間点呼登録が必要です。' :
                            currentWorkflowState === 'needsEnd' ? '運転を終了してください。' :
                            '管理者にお問い合わせください。'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Enhanced Registration Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 flex-1">
                {/* Start Registration Card */}
                <div 
                  onClick={() => isStartButtonEnabled() && handleRegistrationTypeSelect('start')}
                  className={getButtonClassName(isStartButtonEnabled())}
                >
                  <div className="relative bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 overflow-hidden h-full">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
                    <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
                    <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/10 rounded-full"></div>
                    
                    {/* Content */}
                    <div className="relative z-10 text-center text-white space-y-4 h-full flex flex-col justify-center">
                      <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300">
                        🚗{/* 🚀 */}
                      </div>
                      <h3 className="text-xl lg:text-2xl font-bold">運転開始登録</h3>
                      <p className="text-blue-100 text-sm lg:text-base">
                        運転を開始する前の安全チェック
                      </p>
                      <div className="pt-4">
                        <div className="inline-flex items-center gap-2 text-sm bg-white/20 rounded-full px-4 py-2 group-hover:bg-white/30 transition-colors duration-300">
                          <span>開始する</span>
                          <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Middle Registration Card */}
                <div 
                  onClick={() => isMiddleButtonEnabled() && handleRegistrationTypeSelect('middle')}
                  className={getButtonClassName(isMiddleButtonEnabled())}
                >
                  <div className="relative bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 overflow-hidden h-full">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
                    <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
                    <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/10 rounded-full"></div>
                    
                    {/* Content */}
                    <div className="relative z-10 text-center text-white space-y-4 h-full flex flex-col justify-center">
                      <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300">
                        ⏸️
                      </div>
                      <h3 className="text-xl lg:text-2xl font-bold">中間点呼登録</h3>
                      <p className="text-orange-100 text-sm lg:text-base">
                        中間点呼チェック
                      </p>
                      <div className="pt-4">
                        <div className="inline-flex items-center gap-2 text-sm bg-white/20 rounded-full px-4 py-2 group-hover:bg-white/30 transition-colors duration-300">
                          <span>開始する</span>
                          <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* End Registration Card */}
                <div 
                  onClick={() => isEndButtonEnabled() && handleRegistrationTypeSelect('end')}
                  className={getButtonClassName(isEndButtonEnabled())}
                >
                  <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 overflow-hidden h-full">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
                    <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
                    <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/10 rounded-full"></div>
                    
                    {/* Content */}
                    <div className="relative z-10 text-center text-white space-y-4 h-full flex flex-col justify-center">
                      <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300">
                        🏁
                      </div>
                      <h3 className="text-xl lg:text-2xl font-bold">運転終了登録</h3>
                      <p className="text-green-100 text-sm lg:text-base">
                        運転終了前の最終チェック
                      </p>
                      <div className="pt-4">
                        <div className="inline-flex items-center gap-2 text-sm bg-white/20 rounded-full px-4 py-2 group-hover:bg-white/30 transition-colors duration-300">
                          <span>開始する</span>
                          <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stylish Footer */}
              <footer className="mt-16 text-center py-8 border-t border-gray-200">
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-gray-800">テラルテクノサービス株式会社</p>
                  <p className="text-sm text-gray-600">©2025　All Rights Reserved</p>
                </div>
              </footer>
            </div>
          ) : (
            /* Simplified Form Section */
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-6 mb-6 animate-slideIn">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setRegistrationType(null);
                    resetForm();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-xl hover:bg-gray-600 text-sm font-medium transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl w-fit"
                >
                  <span>←</span>
                  <span>戻る</span>
                </button>
                <div className="flex-1">
                  <h2 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent p-3 rounded-xl bg-blue-50">
                    {getRegistrationTitle()}
                  </h2>
                </div>
              </div>

              <div className="space-y-6">
                {/* Driver Information - Auto-populated from logged-in user */}
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                      {user?.displayName?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">
                        運転手: {user?.displayName || 'ユーザー'}
                      </p>
                      <p className="text-sm text-gray-600">
                        ID: {user?.mailNickname || formData.driverName}
                      </p>
                      <p className="text-xs text-blue-600">
                        {user?.jobTitle} | {user?.department}
                      </p>
                    </div>
                  </div>
                  
                  {/* Hidden input to maintain form data */}
                  <input 
                    type="hidden" 
                    value={formData.driverName} 
                    onChange={(e) => handleInputChange('driverName', e.target.value)}
                  />
                  
                  {/* Manual trigger button for testing */}
                  {!formData.driverName && (
                    <button
                      type="button"
                      onClick={() => {
                        console.log('Manual button clicked, user data:', user);
                        // Try multiple fallback methods to get the identifier
                        const driverName = user?.mailNickname || 
                                         user?.email?.split('@')[0] || 
                                         user?.userPrincipalName?.split('@')[0] ||
                                         user?.displayName?.replace(/\s+/g, '.').toLowerCase() ||
                                         'unknown-user';
                        console.log('Setting driver name to:', driverName);
                        setFormData(prev => ({ ...prev, driverName }));
                      }}
                      className="mt-2 px-4 py-2 bg-blue-500 text-white rounded text-sm"
                    >
                      手動で運転手名を設定 (Click to set: {user?.email?.split('@')[0] || 'unknown'})
                    </button>
                  )}
                  
                  {formData.driverExpirationDate && (
                    <div className="mt-3 p-3 rounded-lg bg-white border border-blue-100">
                      <span className="text-gray-600 text-sm">免許証有効期限: </span>
                      <span className={`font-semibold text-sm px-3 py-1 rounded-full ${
                        isExpirationSoon(formData.driverExpirationDate) 
                          ? 'text-red-700 bg-red-100 border border-red-200' 
                          : 'text-green-700 bg-green-100 border border-green-200'
                      }`}>
                        {new Date(formData.driverExpirationDate).toLocaleDateString('ja-JP')}
                        {isExpirationSoon(formData.driverExpirationDate) && (
                          <span className="ml-2 text-xs animate-pulse">⚠️ 3ヶ月以内に期限切れ</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirmer Selection - Show at the beginning */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-2 border-blue-500">
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2 bg-blue-100 p-3 rounded">
                    <span>👥</span>
                    確認者選択
                  </h2>
                  
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-blue-800 mb-2">
                        <strong>あなたの役職：</strong> 
                        {user?.role === 'SafeDrivingManager' ? '安全運転管理者' : 
                         user?.role === 'Manager' ? '管理者' : '一般職員'}
                      </p>
                      <p className="text-xs text-blue-600">
                        {user?.role === 'EntryLevel' 
                          ? '一般職員は上司を確認者として選択してください。'
                          : user?.role === 'Manager'
                          ? '管理者は部下を確認者として選択できます。'
                          : '安全運転管理者は部署のメンバーを確認者として選択できます。'
                        }
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        確認者を選択してください <span className="text-red-500">*</span>
                      </label>
                      
                      <select
                        value={formData.selectedConfirmer}
                        onChange={(e) => {
                          console.log('Confirmer selected:', e.target.value);
                          handleInputChange('selectedConfirmer', e.target.value);
                        }}
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">確認者を選択してください</option>
                        {availableConfirmers.map((confirmer) => (
                          <option key={confirmer.id} value={confirmer.id}>
                            {confirmer.name} ({confirmer.role})
                          </option>
                        ))}
                      </select>
                      
                      {availableConfirmers.length === 0 && (
                        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                          <p className="text-sm text-yellow-800">
                            利用可能な確認者が見つかりません。
                          </p>
                          <div className="mt-2 text-xs text-gray-600">
                            Debug: User={user?.mailNickname}, Role={user?.role}, JobLevel={user?.jobLevel}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              console.log('Manually reloading confirmers...');
                              loadAvailableConfirmers();
                            }}
                            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                          >
                            🔄 確認者を再読み込み
                          </button>
                        </div>
                      )}
                      
                      {availableConfirmers.length > 0 && (
                        <div className="mt-2 text-xs text-gray-400">
                          Debug: {availableConfirmers.length} confirmers available: {availableConfirmers.map(c => `${c.name}(${c.role})`).join(', ')}
                        </div>
                      )}
                    </div>

                    {/* Selected confirmer details */}
                    {formData.selectedConfirmer && (
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        {(() => {
                          const selectedConfirmer = availableConfirmers.find(c => c.id === formData.selectedConfirmer);
                          return selectedConfirmer ? (
                            <div>
                              <p className="text-sm text-green-800">
                                <strong>選択された確認者：</strong> {selectedConfirmer.name}
                              </p>
                              <p className="text-xs text-green-600">
                                役割: {selectedConfirmer.role} | メール: {selectedConfirmer.email}
                              </p>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {/* Progress indicator */}
                    <div className="text-sm text-gray-600">
                      {formData.selectedConfirmer ? (
                        <span className="text-green-600">✓ 確認者の選択が完了しました</span>
                      ) : (
                        <span>確認者を選択してください</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Vehicle Usage Section - Only show for start registration */}
                {registrationType === 'start' && (
                  <>
                    {/* Vehicle Selection - Simplified */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        使用車両 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.vehicle}
                        onChange={(e) => handleInputChange('vehicle', e.target.value)}
                        className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 appearance-none bg-white"
                      >
                        <option value="">車両を選択してください</option>
                        <option value="0">レンタカー</option>
                        {azureVehicles.map(vehicle => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.cleanName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date and Time Fields - Simplified */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          乗車日時 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={formData.boardingDateTime}
                          onChange={(e) => handleInputChange('boardingDateTime', e.target.value)}
                          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          降車日時 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={formData.alightingDateTime}
                          onChange={(e) => handleInputChange('alightingDateTime', e.target.value)}
                          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                        />
                      </div>
                    </div>

                    {/* Destination and Address - Simplified */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          訪問先 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.destination}
                          onChange={(e) => handleInputChange('destination', e.target.value)}
                          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                          placeholder="この項目を入力してください。"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          住所 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.address}
                          onChange={(e) => handleInputChange('address', e.target.value)}
                          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                          placeholder="この項目を入力してください。"
                        />
                      </div>
                    </div>

                    {/* Purpose - Simplified */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        用件 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.purpose}
                        onChange={(e) => handleInputChange('purpose', e.target.value)}
                        className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 appearance-none bg-white"
                      >
                        <option value="">この項目を入力してください。</option>
                        {purposeOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>

                    {/* Progress indicator for vehicle form */}
                    <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                      {isVehicleFormValid ? (
                        <div className="flex items-center gap-2 text-green-700">
                          <span className="text-lg">✅</span>
                          <span className="font-semibold">車両使用届の入力が完了しました</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-blue-700">
                          <span className="text-lg">📋</span>
                          <span>車両使用届の項目をすべて入力してください</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Safety Declaration Section - Only show for start registration */}
                {registrationType === 'start' && isVehicleFormValid && (
                  <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl p-6 mt-8 border border-gray-200 animate-fadeIn">
                    <h3 className="text-xl font-bold mb-6 text-gray-800">
                      安全運転宣言書
                    </h3>
                    
                    {/* Checkboxes - Simplified */}
                    <div className="space-y-4 mb-8">
                      <label className="flex items-center p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.hasLicense}
                          onChange={(e) => handleInputChange('hasLicense', e.target.checked)}
                          className="mr-4 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">運転免許を携帯している</span>
                      </label>

                      <label className="flex items-center p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.noAlcohol}
                          onChange={(e) => handleInputChange('noAlcohol', e.target.checked)}
                          className="mr-4 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">飲酒なし、または飲酒後10時間経過している</span>
                      </label>

                      <label className="flex items-center p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.focusOnDriving}
                          onChange={(e) => handleInputChange('focusOnDriving', e.target.checked)}
                          className="mr-4 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">運転に集中する</span>
                      </label>

                      <label className="flex items-center p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 transition-all duration-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.vehicleInspection}
                          onChange={(e) => handleInputChange('vehicleInspection', e.target.checked)}
                          className="mr-4 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">乗降車前後に車両点検を実施する</span>
                      </label>
                    </div>

                    {/* Driving Rules Selects - Simplified */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          運転中に遵守すること1 <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.drivingRule1}
                          onChange={(e) => handleInputChange('drivingRule1', e.target.value)}
                          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 appearance-none bg-white"
                        >
                          <option value="">選択してください</option>
                          {drivingRulesOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          運転中に遵守すること2 <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.drivingRule2}
                          onChange={(e) => handleInputChange('drivingRule2', e.target.value)}
                          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 appearance-none bg-white"
                        >
                          <option value="">選択してください</option>
                          {drivingRulesOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Progress indicator for safety form */}
                    <div className="p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                      {isSafetyFormValid ? (
                        <div className="flex items-center gap-2 text-green-700">
                          <span className="text-lg">✅</span>
                          <span className="font-semibold">安全運転宣言書の入力が完了しました</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-green-700">
                          <span className="text-lg">📋</span>
                          <span>安全運転宣言書の項目をすべて入力してください</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Camera Section - Always shown for end/middle registration, conditional for start */}
                {(registrationType === 'end' || registrationType === 'middle' || isSafetyFormValid) && (
                  <div className="bg-gradient-to-br from-gray-50 to-purple-50 rounded-2xl p-6 mt-8 border border-gray-200 animate-fadeIn">
                    <h3 className="text-xl font-bold mb-6 text-gray-800">
                      カメラキャプチャ
                    </h3>
                    
                    {/* Additional Input Fields */}
                    <div className="mb-8 space-y-6">
                      {/* Inspection Result - Use End fields for end/middle */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          検査結果 <span className="text-red-500">*</span>
                        </label>
                        <div className="flex rounded-xl overflow-hidden border border-gray-300 focus-within:border-blue-500 transition-all duration-200">
                          <input
                            type="text"
                            value={(registrationType === 'end' || registrationType === 'middle') ? formData.inspectionResultEnd : formData.inspectionResult}
                            onChange={(e) => handleInputChange(
                              (registrationType === 'end' || registrationType === 'middle') ? 'inspectionResultEnd' : 'inspectionResult',
                              e.target.value
                            )}
                            className="flex-1 p-4 focus:ring-0 focus:outline-none border-0"
                            placeholder="検査結果を入力してください"
                          />
                          <span className="inline-flex items-center px-4 bg-gray-50 text-gray-500 text-sm font-medium border-l border-gray-200">
                            mg
                          </span>
                        </div>
                        {(registrationType === 'end' || registrationType === 'middle')
                          ? isInspectionResultGreaterThanZero(formData.inspectionResultEnd) && (
                            <div className="mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-sm">
                              提出不可: 検査結果は0.00である必要があります
                            </div>
                          )
                          : isInspectionResultGreaterThanZero(formData.inspectionResult) && (
                            <div className="mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-sm">
                              提出不可: 検査結果は0.00である必要があります
                            </div>
                          )
                        }
                      </div>
                      {/* Communication Message - Use End fields for end/middle */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          伝達事項
                        </label>
                        <textarea
                          value={(registrationType === 'end' || registrationType === 'middle') ? formData.communicationMessageEnd : formData.communicationMessage}
                          onChange={(e) => handleInputChange(
                            (registrationType === 'end' || registrationType === 'middle') ? 'communicationMessageEnd' : 'communicationMessage',
                            e.target.value
                          )}
                          rows={4}
                          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 resize-none"
                          placeholder="伝達事項を入力してください"
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Camera Section - At End of Form */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-200 mt-8">
                  <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                    📸 写真撮影 <span className="text-red-500">*</span>
                  </h3>
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-amber-800 text-sm font-medium">
                    ⚠️「アルコールチェッカーの測定画面とご自身の顔が一緒に映るように写真を撮ってください。」
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-gray-200">
                    <CameraCapture onImageSend={handleImageSend} autoOpen={true} />
                  </div>
                  
                  {/* Upload Status */}
                  {uploadStatus && (
                    <div className={`mt-4 p-3 rounded-lg text-sm ${
                      uploadStatus.includes('✅') || uploadStatus.includes('完了しました') 
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : isImageUploading 
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : isImageUploaded
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : 'bg-red-100 text-red-700 border border-red-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        {uploadStatus.includes('✅') || uploadStatus.includes('完了しました') ? (
                          <span>✅</span>
                        ) : isImageUploading ? (
                          <span className="animate-spin">⏳</span>
                        ) : isImageUploaded ? (
                          <span>✅</span>
                        ) : (
                          <span>❌</span>
                        )}
                        <span>{uploadStatus}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Submit Button with Image Requirement Status */}
                <div className="mt-8 space-y-4">
                  {/* Form Completion Status */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-gray-50 to-blue-50 border border-gray-200">
                    <div className="space-y-2 text-sm">
                      {/* Vehicle form status - Hidden for end registration */}
                      {registrationType === 'start' && (
                        <div className="flex items-center gap-2">
                          <span className={isVehicleFormValid ? "text-green-600" : "text-gray-500"}>
                            {isVehicleFormValid ? "✅" : "⏳"}
                          </span>
                          <span className={isVehicleFormValid ? "text-green-700 font-medium" : "text-gray-600"}>
                            車両使用届の入力
                          </span>
                        </div>
                      )}
                      {/* Safety form status - Hidden for end registration */}
                      {registrationType === 'start' && (
                        <div className="flex items-center gap-2">
                          <span className={isSafetyFormValid ? "text-green-600" : "text-gray-500"}>
                            {isSafetyFormValid ? "✅" : "⏳"}
                          </span>
                          <span className={isSafetyFormValid ? "text-green-700 font-medium" : "text-gray-600"}>
                            安全運転宣言書の入力
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className={isImageUploaded ? "text-green-600" : "text-red-500"}>
                          {isImageUploaded ? "✅" : "📸"}
                        </span>
                        <span className={isImageUploaded ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                          写真撮影・アップロード {!isImageUploaded && "(必須)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleFormSubmission}
                    disabled={!isFormValid || isImageUploading}
                    className={`w-full py-4 px-6 font-semibold rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transform transition-all duration-300 ${
                      isFormValid && !isImageUploading
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 cursor-pointer shadow-lg hover:shadow-xl hover:scale-[1.02]'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {isImageUploading && <span className="animate-spin">⏳</span>}
                      {isFormValid && !isImageUploading && <span>✨</span>}
                      {isImageUploading ? "画像アップロード中..." : "提出する"}
                      {isFormValid && !isImageUploading && <span>→</span>}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // Render submissions view if requested
  if (currentView === 'submissions' && isAnyAdmin) {
    return (
      <div>
        <SubmissionsManagement 
          onBack={() => setCurrentView('main')} 
          canApprove={isFullAdmin}
          user={user}
        />
        {/* Sign Out Button for Submissions View */}
        <div className="fixed bottom-4 right-4">
          <button 
            onClick={signOut}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow-lg"
          >
            サインアウト
          </button>
        </div>
      </div>
    );
  }

  // Render admin view if requested
  if (currentView === 'admin' && isFullAdmin) {
    return (
      <div>
        <AdminDriverManagement onBack={() => setCurrentView('main')} user={user} />
        {/* Sign Out Button for Admin View */}
        <div className="fixed bottom-4 right-4">
          <button 
            onClick={signOut}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow-lg"
          >
            サインアウト
          </button>
        </div>
      </div>
    );
  }



  // Render approval management view if requested
  if (currentView === 'approvals') {
    return (
      <div>
        <ApprovalManagement onBack={() => setCurrentView('main')} user={tempUser} />
        {/* Sign Out Button for Approval View */}
        <div className="fixed bottom-4 right-4">
          <button 
            onClick={signOut}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow-lg"
          >
            サインアウト
          </button>
        </div>
      </div>
    );
  }

  // Render safety view if requested
  if (currentView === 'safety') {
    return (
      <div>
        <SafetyManagement onBack={() => setCurrentView('main')} user={tempUser} />
        {/* Sign Out Button for Safety View */}
        <div className="fixed bottom-4 right-4">
          <button 
            onClick={signOut}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow-lg"
          >
            サインアウト
          </button>
        </div>
      </div>
    );
  }

  // Vehicle management view - Removed since using Azure AD
  /* if (currentView === 'vehicles' && isFullAdmin) {
    return (
      <div>
        <AdminVehicleManagement onBack={() => setCurrentView('main')} user={user} />
        <div className="fixed bottom-4 right-4">
          <button 
            onClick={signOut}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow-lg"
          >
            サインアウト
          </button>
        </div>
      </div>
    );
  } */

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-500 text-white p-4 text-center">
        <h1 className="text-xl font-bold">車両使用届</h1>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* User Info with Navigation Links */}
        <div className="mb-6 text-right text-sm text-gray-600">
                            ログイン中: ゲストユーザー (認証一時無効)
          {isAnyAdmin && (
            <div className="mt-2 space-x-4">
              {isFullAdmin && (
                <>
                  <button 
                    onClick={() => setCurrentView('admin')}
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    ドライバー管理
                  </button>
                  {/* Vehicle management link - Removed since using Azure AD */}
                  {/* <button 
                    onClick={() => setCurrentView('vehicles')}
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    車両管理
                  </button> */}

                </>
              )}
              {isAnyAdmin && (
                <button 
                  onClick={() => setCurrentView('safety')}
                  className="text-green-500 hover:text-green-700 text-sm"
                >
                  {isFullAdmin ? '安全運転管理' : '提出済み'}
                </button>
              )}
              {/* 提出管理 - TEMPORARILY REMOVED */}
              {/* <button 
                onClick={() => setCurrentView('submissions')}
                className="text-blue-500 hover:text-blue-700 text-sm"
              >
                提出管理
              </button> */}
            </div>
          )}
        </div>

        {/* Vehicle Usage Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-bold mb-6 bg-blue-100 p-3 rounded">使用車両</h2>
          
          {/* Driver Name - Auto-populated from Azure AD */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              運転手名前
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.driverName}
                onChange={(e) => handleInputChange('driverName', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                placeholder="運転手名前"
                readOnly
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <span className="text-xs text-gray-500 bg-blue-100 px-2 py-1 rounded">
                  Azure AD認証済み
                </span>
              </div>
            </div>
            {user && (
              <p className="mt-1 text-xs text-gray-600">
                ログイン中: {user.displayName} ({user.email})
              </p>
            )}
          </div>

          {/* Vehicle */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              使用車両
            </label>
            <select
              value={formData.vehicle}
              onChange={(e) => handleInputChange('vehicle', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">車両を選択してください</option>
              <option value="0">レンタカー</option>
              {azureVehicles.map(vehicle => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.cleanName}
                </option>
              ))}
            </select>
          </div>

          {/* Date and Time Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                乗車日時
              </label>
              <input
                type="datetime-local"
                value={formData.boardingDateTime}
                onChange={(e) => handleInputChange('boardingDateTime', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                降車日時
              </label>
              <input
                type="datetime-local"
                value={formData.alightingDateTime}
                onChange={(e) => handleInputChange('alightingDateTime', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Destination and Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                訪問先
              </label>
              <input
                type="text"
                value={formData.destination}
                onChange={(e) => handleInputChange('destination', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="この項目を入力してください。"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                住所
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="この項目を入力してください。"
              />
            </div>
          </div>

          {/* Purpose */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              用件
            </label>
            <select
              value={formData.purpose}
              onChange={(e) => handleInputChange('purpose', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">この項目を入力してください。</option>
              {purposeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {/* Progress indicator */}
          <div className="mt-4 text-sm text-gray-600">
            {isVehicleFormValid ? (
              <span className="text-green-600">✓ 車両使用届の入力が完了しました</span>
            ) : (
              <span>車両使用届の項目をすべて入力してください</span>
            )}
          </div>
        </div>

        {/* Safety Declaration Form - Only show when vehicle form is complete */}
        {isVehicleFormValid && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-bold mb-6 bg-blue-100 p-3 rounded">安全運転宣言書</h2>
            
            {/* Checkboxes */}
            <div className="space-y-4 mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.hasLicense}
                  onChange={(e) => handleInputChange('hasLicense', e.target.checked)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">運転免許を携帯している</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.noAlcohol}
                  onChange={(e) => handleInputChange('noAlcohol', e.target.checked)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">飲酒なし、または飲酒後10時間経過している</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.focusOnDriving}
                  onChange={(e) => handleInputChange('focusOnDriving', e.target.checked)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">運転に集中する</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.vehicleInspection}
                  onChange={(e) => handleInputChange('vehicleInspection', e.target.checked)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">乗降車前後に車両点検を実施する</span>
              </label>
            </div>

            {/* Driving Rules Selects */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  運転中に遵守すること1
                </label>
                <select
                  value={formData.drivingRule1}
                  onChange={(e) => handleInputChange('drivingRule1', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">選択してください</option>
                  {drivingRulesOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  運転中に遵守すること2
                </label>
                <select
                  value={formData.drivingRule2}
                  onChange={(e) => handleInputChange('drivingRule2', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">選択してください</option>
                  {drivingRulesOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Progress indicator for safety form */}
            <div className="text-sm text-gray-600">
              {isSafetyFormValid ? (
                <span className="text-green-600">✓ 安全運転宣言書の入力が完了しました</span>
              ) : (
                <span>安全運転宣言書の項目をすべて入力してください</span>
              )}
            </div>
          </div>
        )}

        {/* Camera Section with Additional Fields */}
        {isSafetyFormValid && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-bold mb-4">カメラキャプチャ</h2>
            
            {/* Additional Input Fields */}
            <div className="mb-6 space-y-4">
              {/* Inspection Result */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  検査結果
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={formData.inspectionResult}
                    onChange={(e) => handleInputChange('inspectionResult', e.target.value)}
                    className="flex-1 p-3 border border-gray-300 rounded-l-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="検査結果を入力してください"
                  />
                  <span className="inline-flex items-center px-3 border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm rounded-r-md">
                    mg
                  </span>
                </div>
              </div>

              {/* Communication Message */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  伝達事項
                </label>
                <textarea
                  value={formData.communicationMessage}
                  onChange={(e) => handleInputChange('communicationMessage', e.target.value)}
                  rows={4}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="伝達事項を入力してください"
                />
                <div className="mt-2 text-xs text-gray-500">
                  <p>例：体調確認の確認について詳しく記載ください。</p>
                </div>
              </div>
            </div>

            {/* Camera Capture */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-md font-medium mb-4 flex items-center gap-2">
                <span>📷</span>
                写真撮影
              </h3>
              <div className="bg-white rounded-xl p-4 border border-gray-200">
      <CameraCapture onImageSend={handleImageSend} />
              </div>
            </div>
          </div>
        )}





        {/* Submit Button - Only show when everything is complete */}
        {isSafetyFormValid && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            {/* TEST BUTTON - Always enabled to test click handler */}
            <button
              onClick={() => {
                console.log('🧪 TEST BUTTON CLICKED - Handler working!');
                console.log('🔍 CURRENT FORM STATE:');
                console.log('  - Driver Name:', formData.driverName);
                console.log('  - Vehicle:', formData.vehicle);
                console.log('  - Inspection Result:', formData.inspectionResult);
                console.log('  - Selected Confirmer:', formData.selectedConfirmer);
                console.log('  - Registration Type:', registrationType);
                console.log('  - isFormValid:', isFormValid);
                console.log('  - isVehicleFormValid:', isVehicleFormValid);
                console.log('  - isSafetyFormValid:', isSafetyFormValid);
                handleFormSubmission();
              }}
              className="w-full py-2 px-4 mb-4 bg-red-500 hover:bg-red-600 text-white rounded-md font-medium"
            >
              🧪 TEST SUBMIT (Always Enabled) - Check Console for Debug Info
            </button>
            
            <button
              onClick={handleFormSubmission}
              disabled={!isFormValid}
              className={`w-full py-3 px-6 rounded-md font-medium transition-colors ${
                isFormValid
                  ? 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              送信 (Original)
            </button>
            
            {!isFormValid && (
              <div className="mt-3 text-center text-sm text-gray-500">
                <p>すべての必須項目を入力してから送信してください：</p>
                <ul className="mt-2 text-xs text-left max-w-md mx-auto">
                  {!isVehicleFormValid && <li className="text-red-500">• 車両使用届の入力</li>}
                  {!isSafetyFormValid && <li className="text-red-500">• 安全運転宣言書の入力</li>}
                  {!formData.inspectionResult.trim() && <li className="text-red-500">• 検査結果の入力</li>}
                  {!isInspectionResultValid(formData.inspectionResult) && formData.inspectionResult.trim() && <li className="text-red-500">• 検査結果は0以上の数値を入力してください</li>}
                  {!isImageUploaded && <li className="text-red-500">• 写真の撮影</li>}
                  {!formData.selectedConfirmer && <li className="text-red-500">• 確認者の選択</li>}
                </ul>
                <div className="mt-2 text-xs text-gray-400">
                  <p>Debug: Vehicle={isVehicleFormValid ? '✓' : '✗'}, Safety={isSafetyFormValid ? '✓' : '✗'}, Image={isImageUploaded ? '✓' : '✗'}, Confirmer={formData.selectedConfirmer ? '✓' : '✗'}, InspectionValid={isInspectionResultValid(formData.inspectionResult) ? '✓' : '✗'}</p>
                  <p>InspectionResult: "{formData.inspectionResult}", ParsedValue: {parseFloat(formData.inspectionResult)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status Messages */}
      {uploadStatus && (
          <div className={`p-4 rounded-md mb-4 ${
            uploadStatus.includes('失敗') || uploadStatus.includes('failed') 
              ? 'bg-red-100 text-red-700 border border-red-300' 
              : 'bg-green-100 text-green-700 border border-green-300'
          }`}>
          <div className="flex items-center gap-2">
            {uploadStatus.includes('✅') || uploadStatus.includes('完了しました') ? (
              <span>✅</span>
            ) : uploadStatus.includes('失敗') || uploadStatus.includes('failed') ? (
              <span>❌</span>
            ) : (
              <span>ℹ️</span>
            )}
            <span>{uploadStatus}</span>
          </div>
        </div>
      )}

        {/* Sign Out Button - Always visible in main view */}
        <div className="text-center mt-8">
          <button 
            onClick={signOut}
            className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded"
          >
            サインアウト
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
