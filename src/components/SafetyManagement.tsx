import React, { useState, useEffect } from 'react';
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import { ImageDisplay } from './ImageDisplay';
import { useAuth } from '../contexts/AuthContext';
import { getAllSubmissions, getAllDrivers } from '../utils/paginationHelper';


// Configure client to use API key for public access
const client = generateClient<Schema>({
  authMode: 'apiKey'
});

interface SafetyManagementProps {
  onBack?: () => void;
  user?: any;
}

// Type for grouped submissions
interface SubmissionGroup {
  id: string; // Group ID (use start submission ID)
  startSubmission?: any;
  middleSubmissions: any[];
  endSubmission?: any;
  driverName: string;
  vehicle: string;
  submittedAt: string; // Use start submission date for sorting
  isComplete: boolean; // Whether the group has an end submission
}

const SafetyManagement: React.FC<SafetyManagementProps> = ({ onBack, user }) => {
  const { graphService } = useAuth();
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<any[]>([]);
  const [submissionGroups, setSubmissionGroups] = useState<SubmissionGroup[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<SubmissionGroup[]>([]);
  const [relatedSubmissions, setRelatedSubmissions] = useState<Map<string, any>>(new Map()); // Store related submissions
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBy, setSearchBy] = useState<'all' | 'driverName' | 'vehicle' | 'approvedBy'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'PENDING' | 'APPROVED'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'individual'>('grouped'); // New toggle for view mode
  const [status, setStatus] = useState('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [vehicleNames, setVehicleNames] = useState<{[key: string]: string}>({});
  const [driverNames, setDriverNames] = useState<{[key: string]: string}>({}); // Map mailNickname to actual name
  const itemsPerPage = 10;

  // Temporarily bypass admin check for authentication removal
  // const isAdmin = true; // user?.signInDetails?.loginId === "tts-driver-admin@teral.co.jp" || user?.username === "tts-driver-admin@teral.co.jp" || user?.signInDetails?.loginId === "tts-driver@teral.co.jp" || user?.username === "tts-driver@teral.co.jp";

  useEffect(() => {
    loadSubmissions();
  }, []);

  useEffect(() => {
    if (viewMode === 'grouped') {
      createSubmissionGroups();
    } else {
      filterSubmissions();
    }
  }, [searchTerm, searchBy, statusFilter, dateFrom, dateTo, allSubmissions, viewMode]);

  // Resolve vehicle names and driver names when submissions change
  useEffect(() => {
    if (allSubmissions.length > 0) {
      if (graphService) {
        resolveVehicleNames();
      }
      resolveDriverNames();
    }
  }, [allSubmissions, graphService]);

  const loadSubmissions = async () => {
    try {
      console.log('📄 Loading all submissions with pagination...');
      setStatus('申請データを読み込み中...');
      
      // Get ALL submissions using paginated query - filter for PENDING and APPROVED only
      const allPendingSubmissions = await getAllSubmissions({
        approvalStatus: 'PENDING',
        maxItems: 25000 // Reasonable limit for safety management view
      });
      
      const allApprovedSubmissions = await getAllSubmissions({
        approvalStatus: 'APPROVED', 
        maxItems: 25000 // Reasonable limit for safety management view
      });
      
      // Combine both arrays
      const relevantSubmissions = [...allPendingSubmissions, ...allApprovedSubmissions];
      
      console.log(`📊 Loaded ${relevantSubmissions.length} total submissions (${allPendingSubmissions.length} pending + ${allApprovedSubmissions.length} approved)`);
      
      setAllSubmissions(relevantSubmissions);
      setStatus(`✅ ${relevantSubmissions.length}件の申請を読み込みました`);
      
      // Fetch related submissions for end registrations
      await fetchRelatedSubmissions(relevantSubmissions);
      
    } catch (error) {
      console.error('Failed to load submissions:', error);
      setStatus('申請一覧の読み込みに失敗しました: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Create grouped submissions
  const createSubmissionGroups = () => {
    console.log('🔗 Creating submission groups from:', allSubmissions.length, 'submissions');
    
    // Process submissions and their relationships
    
    const groups = new Map<string, SubmissionGroup>();
    
    // First, find all start submissions and create groups
    allSubmissions.forEach(submission => {
      if (submission.registrationType === '運転開始登録') {
        groups.set(submission.id, {
          id: submission.id,
          startSubmission: submission,
          middleSubmissions: [],
          endSubmission: undefined,
          driverName: submission.driverName || 'Unknown Driver',
          vehicle: submission.vehicle || 'Unknown Vehicle',
          submittedAt: submission.submittedAt,
          isComplete: false
        });
      }
    });

    console.log('📦 Created', groups.size, 'initial groups');

    // Then, add middle and end submissions to their respective groups
    allSubmissions.forEach(submission => {
      if (submission.registrationType === '中間点呼登録' && submission.relatedSubmissionId) {
        const group = groups.get(submission.relatedSubmissionId);
        if (group) {
          group.middleSubmissions.push(submission);
        }
      } else if (submission.registrationType === '運転終了登録' && submission.relatedSubmissionId) {
        const group = groups.get(submission.relatedSubmissionId);
        if (group) {
          group.endSubmission = submission;
          group.isComplete = true;
        }
      }
    });

    // Handle orphaned submissions (middle/end without start)
    allSubmissions.forEach(submission => {
      if ((submission.registrationType === '中間点呼登録' || submission.registrationType === '運転終了登録') && 
          !submission.relatedSubmissionId) {
        // Create a standalone group for orphaned submissions
        groups.set(submission.id, {
          id: submission.id,
          startSubmission: undefined,
          middleSubmissions: submission.registrationType === '中間点呼登録' ? [submission] : [],
          endSubmission: submission.registrationType === '運転終了登録' ? submission : undefined,
          driverName: submission.driverName || 'Unknown Driver',
          vehicle: submission.vehicle || 'Unknown Vehicle',
          submittedAt: submission.submittedAt,
          isComplete: submission.registrationType === '運転終了登録'
        });
      }
    });

    let groupsArray = Array.from(groups.values());

    // Apply status filter to groups
    if (statusFilter !== 'all') {
      groupsArray = groupsArray.filter(group => {
        const allSubmissionsInGroup = [
          group.startSubmission,
          ...group.middleSubmissions,
          group.endSubmission
        ].filter(Boolean);
        
        return allSubmissionsInGroup.some(sub => sub.approvalStatus === statusFilter);
      });
    }

    // Apply search filter to groups
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      groupsArray = groupsArray.filter(group => {
        const allSubmissionsInGroup = [
          group.startSubmission,
          ...group.middleSubmissions,
          group.endSubmission
        ].filter(Boolean);

        return allSubmissionsInGroup.some(submission => {
          switch (searchBy) {
            case 'driverName':
              return submission.driverName?.toLowerCase().includes(term);
            case 'vehicle':
              return submission.vehicle?.toLowerCase().includes(term);
            case 'approvedBy':
              return submission.approvedBy?.toLowerCase().includes(term);
            case 'all':
            default:
              return (
                submission.driverName?.toLowerCase().includes(term) ||
                submission.vehicle?.toLowerCase().includes(term) ||
                submission.destination?.toLowerCase().includes(term) ||
                submission.address?.toLowerCase().includes(term) ||
                submission.purpose?.toLowerCase().includes(term) ||
                submission.approvedBy?.toLowerCase().includes(term) ||
                submission.submittedBy?.toLowerCase().includes(term)
              );
          }
        });
      });
    }

    // Apply date filter to groups
    if (dateFrom || dateTo) {
      groupsArray = groupsArray.filter(group => {
        const allSubmissionsInGroup = [
          group.startSubmission,
          ...group.middleSubmissions,
          group.endSubmission
        ].filter(Boolean);

        return allSubmissionsInGroup.some(submission => isDateInRange(submission.submittedAt));
      });
    }

    console.log('🎯 Final groups created:', groups.size);
    
    setSubmissionGroups(Array.from(groups.values()));
    setFilteredGroups(groupsArray);
    setCurrentPage(1);
  };

  // Fetch related submissions for end registrations
  const fetchRelatedSubmissions = async (submissions: any[]) => {
    const relatedMap = new Map();
    
    for (const submission of submissions) {
      if ((submission.registrationType === '運転終了登録' || submission.registrationType === '中間点呼登録') && submission.relatedSubmissionId) {
        try {
          const relatedSubmission = await client.models.AlcoholCheckSubmission.get({
            id: submission.relatedSubmissionId
          });
          if (relatedSubmission.data) {
            relatedMap.set(submission.id, relatedSubmission.data);
          }
        } catch (error) {
          console.error(`Failed to fetch related submission for ${submission.id}:`, error);
        }
      }
    }
    
    setRelatedSubmissions(relatedMap);
  };

  const resolveVehicleNames = async () => {
    if (!graphService) return;
    
    try {
      // Get unique vehicle IDs from submissions
      const vehicleIds = [...new Set(
        allSubmissions
          .map(sub => sub.vehicle)
          .filter(id => id && !vehicleNames[id])
      )];

      if (vehicleIds.length === 0) return;

      console.log('Resolving vehicle names for', vehicleIds.length, 'vehicles');
      const resolved = await graphService.resolveVehicleIds(vehicleIds);
      
      setVehicleNames(prev => ({ ...prev, ...resolved }));
      console.log('Resolved', Object.keys(resolved).length, 'vehicle names');
    } catch (error) {
      console.error('Failed to resolve vehicle names:', error);
    }
  };

  const resolveDriverNames = async () => {
    try {
      const driverMap: {[key: string]: string} = {};
      
      // Get unique driver identifiers from submissions (these are mailNicknames)
      const uniqueDrivers = [...new Set(allSubmissions.map(s => s.driverName).filter(Boolean))];
      
      console.log('🔍 Resolving driver names for', uniqueDrivers.length, 'drivers');
      
      // Load all drivers using paginated query
      const drivers = await getAllDrivers({ excludeDeleted: true });
      console.log('📋 Loaded drivers from schema:', drivers.length);
      
      for (const mailNickname of uniqueDrivers) {
        // Find the driver by matching the mailNickname with the email prefix
        const matchedDriver = drivers.find(driver => {
          if (!driver.mail) return false;
          const emailPrefix = driver.mail.split('@')[0].toLowerCase();
          return emailPrefix === mailNickname.toLowerCase();
        });
        
        if (matchedDriver && matchedDriver.name) {
          driverMap[mailNickname] = matchedDriver.name;
          console.log(`✅ Resolved driver name successfully`);
        } else {
                      console.log(`❌ Could not resolve driver name`);
        }
      }
      
      console.log('🎯 Final driver mapping completed:', Object.keys(driverMap).length, 'drivers resolved');
      setDriverNames(driverMap);
    } catch (error) {
      console.error('Error resolving driver names:', error);
    }
  };

  const filterSubmissions = () => {
    let filtered = allSubmissions;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(submission => submission.approvalStatus === statusFilter);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(submission => {
        switch (searchBy) {
          case 'driverName':
            return submission.driverName?.toLowerCase().includes(term);
          case 'vehicle':
            return submission.vehicle?.toLowerCase().includes(term);
          case 'approvedBy':
            return submission.approvedBy?.toLowerCase().includes(term);
          case 'all':
          default:
            return (
              submission.driverName?.toLowerCase().includes(term) ||
              submission.vehicle?.toLowerCase().includes(term) ||
              submission.destination?.toLowerCase().includes(term) ||
              submission.address?.toLowerCase().includes(term) ||
              submission.purpose?.toLowerCase().includes(term) ||
              submission.approvedBy?.toLowerCase().includes(term) ||
              submission.submittedBy?.toLowerCase().includes(term)
            );
        }
      });
    }

    // Apply date filter
    if (dateFrom || dateTo) {
      filtered = filtered.filter(submission => isDateInRange(submission.submittedAt));
    }

    setFilteredSubmissions(filtered);
    setCurrentPage(1);
  };

  const toggleCard = (submissionId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(submissionId)) {
      newExpanded.delete(submissionId);
    } else {
      newExpanded.add(submissionId);
    }
    setExpandedCards(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'PENDING':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return '承認済み';
      case 'PENDING':
        return '承認待ち';
      case 'REJECTED':
        return '却下';
      default:
        return '不明';
    }
  };

  // Function to determine actual driving status considering end registrations
  const getActualDrivingStatus = (submission: any) => {
    // If this is an end registration, it's always ended
    if (submission.registrationType === '運転終了登録') {
      return '運転終了';
    }

    // For start and middle registrations, check if there's a corresponding end registration
    if (submission.registrationType === '運転開始登録' || submission.registrationType === '中間点呼登録') {
      // Check if any end registration references this submission
      const hasEndRegistration = allSubmissions.some(endSubmission => 
        endSubmission.registrationType === '運転終了登録' && 
        endSubmission.relatedSubmissionId === submission.id &&
        endSubmission.approvalStatus === 'APPROVED'
      );
      
      return hasEndRegistration ? '運転終了' : '運転中';
    }

    // Fallback to original status
    return submission.drivingStatus || '運転中';
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('ja-JP');
    } catch {
      return dateString;
    }
  };

  // Helper function to get the resolved driver name
  const getResolvedDriverName = (originalDriverName: string) => {
    return driverNames[originalDriverName] || originalDriverName;
  };

  // Helper function to check if a date is within the specified range
  const isDateInRange = (submissionDate: string) => {
    if (!dateFrom && !dateTo) return true; // No date filter applied
    
    const subDate = new Date(submissionDate);
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null; // Include the entire end date
    
    if (fromDate && subDate < fromDate) return false;
    if (toDate && subDate > toDate) return false;
    
    return true;
  };

  // Pagination calculations for both modes
  const itemsToDisplay = viewMode === 'grouped' ? filteredGroups : filteredSubmissions;
  const totalPages = Math.ceil(itemsToDisplay.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  
  const currentSubmissions = viewMode === 'individual' 
    ? filteredSubmissions
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        .slice(startIndex, endIndex)
    : [];
    
  const currentGroups = viewMode === 'grouped' 
    ? filteredGroups
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        .slice(startIndex, endIndex)
    : [];

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setExpandedCards(new Set()); // Collapse all cards when changing pages
  };

  // Temporarily bypass admin access restriction
  // if (!isAdmin) {
  //   return (
  //     <div className="min-h-screen bg-gray-50 flex items-center justify-center">
  //       <div className="bg-white p-8 rounded-lg shadow-md">
  //         <h1 className="text-xl font-bold text-red-600 mb-4">アクセス拒否</h1>
  //         <p>このページにアクセスする権限がありません。</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-500 text-white p-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">安全運転管理</h1>
            <p className="text-sm opacity-90">
              {viewMode === 'grouped' ? (
                <>
                  グループ数: {filteredGroups.length} | 
                  完了済み: {filteredGroups.filter(g => g.isComplete).length} | 
                  進行中: {filteredGroups.filter(g => !g.isComplete).length}
                </>
              ) : (
                <>
                  全申請: {filteredSubmissions.length}件 | 
                  承認済み: {filteredSubmissions.filter(s => s.approvalStatus === 'APPROVED').length}件 | 
                  承認待ち: {filteredSubmissions.filter(s => s.approvalStatus === 'PENDING').length}件
                </>
              )} |
              あなたの役職: {user?.position || '一般'} (レベル{user?.jobLevel || 1})
            </p>
          </div>
          {onBack && (
            <button 
              onClick={onBack}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm"
            >
              ← 戻る
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Search Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">検索フィルター</h2>
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">表示モード:</span>
              <button
                onClick={() => setViewMode('grouped')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  viewMode === 'grouped' 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                📦 グループ表示
              </button>
              <button
                onClick={() => setViewMode('individual')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  viewMode === 'individual' 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                📋 個別表示
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {/* First Row - Status, Search By, Search Term */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  承認状態
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="all">すべて</option>
                  <option value="PENDING">承認待ち</option>
                  <option value="APPROVED">承認済み</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  検索条件
                </label>
                <select
                  value={searchBy}
                  onChange={(e) => setSearchBy(e.target.value as typeof searchBy)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="all">すべての項目</option>
                  <option value="driverName">運転手名前</option>
                  <option value="vehicle">使用車両</option>
                  <option value="approvedBy">承認者</option>
                </select>
              </div>
              <div className="flex-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  検索キーワード
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="検索キーワードを入力..."
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
            </div>
            
            {/* Second Row - Date Filters */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📅 申請日（開始）
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📅 申請日（終了）
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🗑️ リセット
                </label>
                <button
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setSearchTerm('');
                    setStatusFilter('all');
                    setSearchBy('all');
                  }}
                  className="w-full p-3 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
                >
                  フィルターをクリア
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <span className="font-medium">検索結果:</span> 
            {viewMode === 'grouped' ? (
              <>
                {filteredGroups.length} グループ 
                {(searchTerm || dateFrom || dateTo) && <span className="ml-2">（全 {submissionGroups.length} グループ中）</span>}
              </>
            ) : (
              <>
                {filteredSubmissions.length} 件 
                {(searchTerm || dateFrom || dateTo) && <span className="ml-2">（全 {allSubmissions.length} 件中）</span>}
              </>
            )}
            {/* Show active filters */}
            {(dateFrom || dateTo || searchTerm || statusFilter !== 'all') && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-xs text-gray-500">アクティブフィルター:</span>
                {statusFilter !== 'all' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    状態: {statusFilter === 'PENDING' ? '承認待ち' : '承認済み'}
                  </span>
                )}
                {searchTerm && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    キーワード: {searchTerm}
                  </span>
                )}
                {dateFrom && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    開始日: {dateFrom}
                  </span>
                )}
                {dateTo && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                    終了日: {dateTo}
                  </span>
                )}
              </div>
            )}
          </div>
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

        {/* Pagination Info */}
        {itemsToDisplay.length > 0 && (
          <div className="mb-4 text-sm text-gray-600">
            {startIndex + 1} - {Math.min(endIndex, itemsToDisplay.length)} {viewMode === 'grouped' ? 'グループ目' : '件目'} / 全 {itemsToDisplay.length} {viewMode === 'grouped' ? 'グループ' : '件'}
            {totalPages > 1 && (
              <span className="ml-4">
                ページ {currentPage} / {totalPages}
              </span>
            )}
          </div>
        )}

        {/* Submissions Cards */}
        <div className="space-y-4 mb-6">
          {(viewMode === 'grouped' ? currentGroups.length === 0 : currentSubmissions.length === 0) ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
              {(searchTerm || dateFrom || dateTo || statusFilter !== 'all') ? '検索条件に一致する申請がありません' : '申請がありません'}
            </div>
          ) : viewMode === 'grouped' ? (
            // Render grouped submissions
            currentGroups.map((group) => (
              <div key={group.id} className="bg-white rounded-lg shadow-md overflow-hidden border-l-4 border-green-500">
                {/* Group Header */}
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors bg-gradient-to-r from-green-50 to-blue-50"
                  onClick={() => toggleCard(group.id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          📦
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-gray-900 text-lg">
                            {getResolvedDriverName(group.driverName)}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            group.isComplete 
                              ? 'bg-green-100 text-green-800 border border-green-300' 
                              : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                          }`}>
                            {group.isComplete ? '🏁 完了' : '🚗 進行中'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {(group.vehicle && vehicleNames[group.vehicle]) || group.vehicle} • {formatDate(group.submittedAt)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {group.startSubmission && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              開始
                            </span>
                          )}
                          {group.middleSubmissions.length > 0 && (
                            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                              中間 ×{group.middleSubmissions.length}
                            </span>
                          )}
                          {group.endSubmission && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              終了
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="text-right mr-4">
                        <div className="text-sm font-medium text-gray-700">
                          合計: {[group.startSubmission, ...group.middleSubmissions, group.endSubmission].filter(Boolean).length} 件
                        </div>
                        <div className="text-xs text-gray-500">
                          画像: {[
                            group.startSubmission?.imageKey,
                            ...group.middleSubmissions.map(m => m.imageKeyEnd),
                            group.endSubmission?.imageKeyEnd
                          ].filter(Boolean).length} 枚
                        </div>
                      </div>
                      <svg 
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedCards.has(group.id) ? 'rotate-180' : ''
                        }`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Group Body - Expandable */}
                {expandedCards.has(group.id) && (
                  <div className="border-t border-gray-200">
                    {/* All Images in a Row */}
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                      <h4 className="font-semibold text-gray-700 mb-3">📸 すべての撮影画像</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Start image */}
                        {group.startSubmission?.imageKey && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
                              🚗 運転開始時 ({formatDate(group.startSubmission.submittedAt)})
                            </div>
                            <div className="w-full h-48 border-2 border-blue-200 rounded-lg overflow-hidden">
                              <ImageDisplay fileName={group.startSubmission.imageKey} />
                            </div>
                            <div className="text-xs text-gray-500">
                              検査結果: {group.startSubmission.inspectionResult || 'N/A'} mg
                            </div>
                          </div>
                        )}
                        
                        {/* Middle images */}
                        {group.middleSubmissions.map((middleSubmission, index) => 
                          middleSubmission.imageKeyEnd && (
                            <div key={`middle-${index}`} className="space-y-2">
                              <div className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-1 rounded">
                                ⏸️ 中間点呼時 #{index + 1} ({formatDate(middleSubmission.submittedAt)})
                              </div>
                              <div className="w-full h-48 border-2 border-orange-200 rounded-lg overflow-hidden">
                                <ImageDisplay fileName={middleSubmission.imageKeyEnd} />
                              </div>
                              <div className="text-xs text-gray-500">
                                検査結果: {middleSubmission.inspectionResultEnd || 'N/A'} mg
                              </div>
                            </div>
                          )
                        )}
                        
                        {/* End image */}
                        {group.endSubmission?.imageKeyEnd && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                              🏁 運転終了時 ({formatDate(group.endSubmission.submittedAt)})
                            </div>
                            <div className="w-full h-48 border-2 border-green-200 rounded-lg overflow-hidden">
                              <ImageDisplay fileName={group.endSubmission.imageKeyEnd} />
                            </div>
                            <div className="text-xs text-gray-500">
                              検査結果: {group.endSubmission.inspectionResultEnd || 'N/A'} mg
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Detailed Information */}
                    <div className="p-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {/* Start Submission Details */}
                        {group.startSubmission && (
                          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <h5 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                              🚗 運転開始登録
                              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(group.startSubmission.approvalStatus)}`}>
                                {getStatusText(group.startSubmission.approvalStatus)}
                              </span>
                            </h5>
                            <div className="space-y-1 text-sm">
                              <div><span className="font-medium">乗車日時:</span> {formatDate(group.startSubmission.boardingDateTime)}</div>
                              <div><span className="font-medium">降車日時:</span> {formatDate(group.startSubmission.alightingDateTime)}</div>
                              <div><span className="font-medium">訪問先:</span> {group.startSubmission.destination}</div>
                              <div><span className="font-medium">住所:</span> {group.startSubmission.address}</div>
                              <div><span className="font-medium">用件:</span> {group.startSubmission.purpose}</div>
                              <div><span className="font-medium">検査結果:</span> {group.startSubmission.inspectionResult} mg</div>
                              <div><span className="font-medium">承認者:</span> {group.startSubmission.approvedBy}</div>
                            </div>
                          </div>
                        )}

                        {/* Middle Submissions Details */}
                        {group.middleSubmissions.length > 0 && (
                          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                            <h5 className="font-semibold text-orange-800 mb-3">⏸️ 中間点呼登録 ({group.middleSubmissions.length}件)</h5>
                            <div className="space-y-3">
                              {group.middleSubmissions.map((middle, index) => (
                                <div key={index} className="bg-white p-3 rounded border border-orange-100">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-medium">#{index + 1}</span>
                                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(middle.approvalStatus)}`}>
                                      {getStatusText(middle.approvalStatus)}
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    <div><span className="font-medium">提出日時:</span> {formatDate(middle.submittedAt)}</div>
                                    <div><span className="font-medium">検査結果:</span> {middle.inspectionResultEnd} mg</div>
                                    <div><span className="font-medium">承認者:</span> {middle.approvedBy}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* End Submission Details */}
                        {group.endSubmission && (
                          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                            <h5 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                              🏁 運転終了登録
                              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(group.endSubmission.approvalStatus)}`}>
                                {getStatusText(group.endSubmission.approvalStatus)}
                              </span>
                            </h5>
                            <div className="space-y-1 text-sm">
                              <div><span className="font-medium">提出日時:</span> {formatDate(group.endSubmission.submittedAt)}</div>
                              <div><span className="font-medium">検査結果:</span> {group.endSubmission.inspectionResultEnd} mg</div>
                              <div><span className="font-medium">伝達事項:</span> {group.endSubmission.communicationMessageEnd || 'なし'}</div>
                              <div><span className="font-medium">承認者:</span> {group.endSubmission.approvedBy}</div>
                              <div><span className="font-medium">承認日時:</span> {group.endSubmission.approvedAt ? formatDate(group.endSubmission.approvedAt) : 'N/A'}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            // Original individual rendering
            currentSubmissions.map((submission) => (
              <div key={submission.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Card Header - Always Visible */}
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleCard(submission.id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(submission.approvalStatus)}`}>
                      {getStatusText(submission.approvalStatus)}
                    </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {getResolvedDriverName(submission.driverName || 'Unknown Driver')}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {(submission.vehicle && vehicleNames[submission.vehicle]) || submission.vehicle || 'Unknown Vehicle'} • {formatDate(submission.submittedAt)}
                        </p>
                        <p className="text-xs text-green-600">
                          承認者: {submission.approvedBy} • {submission.approvedAt ? formatDate(submission.approvedAt) : ''}
                        </p>
                        <div className="mt-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            getActualDrivingStatus(submission) === '運転中' 
                              ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
                              : 'bg-green-100 text-green-800 border border-green-300'
                          }`}>
                            {getActualDrivingStatus(submission) === '運転中' ? '🚗 運転中' : '🏁 運転終了'}
                          </span>
                          <span className="ml-2 text-xs text-gray-500">
                            {submission.registrationType}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-500 mr-2">
                        提出者: {submission.submittedBy || 'Unknown'}
                      </span>
                      <svg 
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedCards.has(submission.id) ? 'rotate-180' : ''
                        }`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Card Body - Expandable */}
                {expandedCards.has(submission.id) && (
                  <div className="border-t border-gray-200 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      {/* Vehicle Information */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-700 border-b pb-1">車両情報</h4>
                        <div><span className="font-medium">運転手:</span> {getResolvedDriverName(submission.driverName || 'N/A')}</div>
                        <div><span className="font-medium">車両:</span> {(submission.vehicle && vehicleNames[submission.vehicle]) || submission.vehicle || 'N/A'}</div>
                        <div><span className="font-medium">乗車日時:</span> {submission.boardingDateTime ? formatDate(submission.boardingDateTime) : 'N/A'}</div>
                        <div><span className="font-medium">降車日時:</span> {submission.alightingDateTime ? formatDate(submission.alightingDateTime) : 'N/A'}</div>
                        <div><span className="font-medium">訪問先:</span> {submission.destination || 'N/A'}</div>
                        <div><span className="font-medium">住所:</span> {submission.address || 'N/A'}</div>
                        <div><span className="font-medium">用件:</span> {submission.purpose || 'N/A'}</div>
                      </div>

                      {/* Safety Declaration */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-700 border-b pb-1">安全運転宣言</h4>
                        <div><span className="font-medium">免許携帯:</span> {submission.hasLicense ? 'はい' : 'いいえ'}</div>
                        <div><span className="font-medium">飲酒なし:</span> {submission.noAlcohol ? 'はい' : 'いいえ'}</div>
                        <div><span className="font-medium">運転集中:</span> {submission.focusOnDriving ? 'はい' : 'いいえ'}</div>
                        <div><span className="font-medium">車両点検:</span> {submission.vehicleInspection ? 'はい' : 'いいえ'}</div>
                        <div><span className="font-medium">遵守事項1:</span> {submission.drivingRule1 || 'N/A'}</div>
                        <div><span className="font-medium">遵守事項2:</span> {submission.drivingRule2 || 'N/A'}</div>
                      </div>

                      {/* Additional Information */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-700 border-b pb-1">承認情報</h4>
                        {submission.registrationType === '運転終了登録' ? (
                          <>
                            {/* Show both start and end data for end registration */}
                            {(() => {
                              const relatedSubmission = relatedSubmissions.get(submission.id);
                              return (
                                <>
                                  <div><span className="font-medium">開始時検査結果:</span> {relatedSubmission?.inspectionResult ? `${relatedSubmission.inspectionResult} mg` : 'N/A'}</div>
                                  <div><span className="font-medium">終了時検査結果:</span> {submission.inspectionResultEnd ? `${submission.inspectionResultEnd} mg` : 'N/A'}</div>
                                  <div><span className="font-medium">開始時伝達事項:</span> {relatedSubmission?.communicationMessage || 'N/A'}</div>
                                  <div><span className="font-medium">終了時伝達事項:</span> {submission.communicationMessageEnd || 'N/A'}</div>
                                </>
                              );
                            })()}
                          </>
                        ) : submission.registrationType === '中間点呼登録' ? (
                          <>
                            {/* Show middle registration specific data */}
                            <div><span className="font-medium">検査結果:</span> {submission.inspectionResultEnd ? `${submission.inspectionResultEnd} mg` : 'N/A'}</div>
                            <div><span className="font-medium">伝達事項:</span> {submission.communicationMessageEnd || 'N/A'}</div>
                          </>
                        ) : (
                          <>
                            {/* Show start registration data */}
                            <div><span className="font-medium">検査結果:</span> {submission.inspectionResult ? `${submission.inspectionResult} mg` : 'N/A'}</div>
                            <div><span className="font-medium">伝達事項:</span> {submission.communicationMessage || 'N/A'}</div>
                          </>
                        )}
                        <div><span className="font-medium">提出日時:</span> {formatDate(submission.submittedAt)}</div>
                        <div><span className="font-medium">承認日時:</span> {submission.approvedAt ? formatDate(submission.approvedAt) : 'N/A'}</div>
                      </div>

                      {/* Image Display - Support for dual images */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-700 border-b pb-1">撮影画像</h4>
                        {submission.registrationType === '運転終了登録' ? (
                          <div className="space-y-2">
                            <div className="text-xs text-gray-600 font-medium">
                              撮影画像
                            </div>
                            <div className="w-full h-48">
                              <ImageDisplay 
                                fileName={submission.imageKeyEnd} 
                              />
                            </div>
                            <div className="text-xs text-gray-500">
                              ファイル名: {submission.imageKeyEnd}
                            </div>
                          </div>
                        ) : submission.registrationType === '中間点呼登録' ? (
                          <div className="space-y-2">
                            <div className="text-xs text-gray-600 font-medium">
                              撮影画像
                            </div>
                            <div className="w-full h-48">
                              <ImageDisplay 
                                fileName={submission.imageKeyEnd} 
                              />
                            </div>
                            <div className="text-xs text-gray-500">
                              ファイル名: {submission.imageKeyEnd}
                            </div>
                          </div>
                        ) : (
                          submission.imageKey ? (
                            <div className="space-y-2">
                              <div className="text-xs text-gray-600 font-medium">
                                撮影画像
                              </div>
                              <div className="w-full h-48">
                                <ImageDisplay 
                                  fileName={submission.imageKey} 
                                />
                              </div>
                              <div className="text-xs text-gray-500">
                                ファイル名: {submission.imageKey}
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                              画像なし
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex justify-center">
              <div className="flex space-x-2">
                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-3 py-2 rounded text-sm ${
                    currentPage === 1
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  前へ
                </button>

                {/* Page Numbers */}
                {[...Array(totalPages)].map((_, index) => {
                  const page = index + 1;
                  const isCurrentPage = page === currentPage;
                  
                  // Show first, last, current, and adjacent pages
                  if (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`px-3 py-2 rounded text-sm ${
                          isCurrentPage
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <span key={page} className="px-3 py-2 text-gray-500">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}

                {/* Next Button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-2 rounded text-sm ${
                    currentPage === totalPages
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  次へ
                </button>
              </div>
            </div>
            <div className="text-center mt-2 text-sm text-gray-600">
              {startIndex + 1} - {Math.min(endIndex, itemsToDisplay.length)} / {itemsToDisplay.length} {viewMode === 'grouped' ? 'グループ' : '件'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SafetyManagement; 