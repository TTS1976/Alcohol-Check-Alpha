import React, { useState, useEffect } from 'react';
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import { ImageDisplay } from './ImageDisplay';
import { useAuth } from '../contexts/AuthContext';


// Configure client to use API key for public access
const client = generateClient<Schema>({
  authMode: 'apiKey'
});

interface SafetyManagementProps {
  onBack?: () => void;
  user?: any;
}

const SafetyManagement: React.FC<SafetyManagementProps> = ({ onBack, user }) => {
  const { graphService } = useAuth();
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<any[]>([]);
  const [relatedSubmissions, setRelatedSubmissions] = useState<Map<string, any>>(new Map()); // Store related submissions
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBy, setSearchBy] = useState<'all' | 'driverName' | 'vehicle' | 'approvedBy'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'PENDING' | 'APPROVED'>('all');
  const [status, setStatus] = useState('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [vehicleNames, setVehicleNames] = useState<{[key: string]: string}>({});
  const itemsPerPage = 10;

  // Temporarily bypass admin check for authentication removal
  // const isAdmin = true; // user?.signInDetails?.loginId === "tts-driver-admin@teral.co.jp" || user?.username === "tts-driver-admin@teral.co.jp" || user?.signInDetails?.loginId === "tts-driver@teral.co.jp" || user?.username === "tts-driver@teral.co.jp";

  useEffect(() => {
    loadSubmissions();
  }, []);

  useEffect(() => {
    filterSubmissions();
  }, [searchTerm, searchBy, statusFilter, allSubmissions]);

  // Resolve vehicle names when submissions change
  useEffect(() => {
    if (allSubmissions.length > 0 && graphService) {
      resolveVehicleNames();
    }
  }, [allSubmissions, graphService]);

  const loadSubmissions = async () => {
    try {
      client.models.AlcoholCheckSubmission.observeQuery().subscribe({
        next: async (data) => {
          // Filter to show both PENDING and APPROVED submissions
          const relevantSubmissions = data.items.filter(item => 
            item && item.id && (item.approvalStatus === 'APPROVED' || item.approvalStatus === 'PENDING')
          );
          setAllSubmissions(relevantSubmissions);
          
          // Fetch related submissions for end registrations
          await fetchRelatedSubmissions(relevantSubmissions);
        },
      });
    } catch (error) {
      console.error('Failed to load submissions:', error);
      setStatus('申請一覧の読み込みに失敗しました');
    }
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

      console.log('Resolving vehicle names for IDs:', vehicleIds);
      const resolved = await graphService.resolveVehicleIds(vehicleIds);
      
      setVehicleNames(prev => ({ ...prev, ...resolved }));
      console.log('Resolved vehicle names:', resolved);
    } catch (error) {
      console.error('Failed to resolve vehicle names:', error);
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

  // Pagination calculations
  const totalPages = Math.ceil(filteredSubmissions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSubmissions = filteredSubmissions
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(startIndex, endIndex);

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
              全申請: {filteredSubmissions.length}件 | 
              承認済み: {filteredSubmissions.filter(s => s.approvalStatus === 'APPROVED').length}件 | 
              承認待ち: {filteredSubmissions.filter(s => s.approvalStatus === 'PENDING').length}件 |
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
          <h2 className="text-lg font-bold mb-4">検索フィルター</h2>
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
          <div className="mt-4 text-sm text-gray-600">
            <span className="font-medium">検索結果:</span> {filteredSubmissions.length} 件 
            {searchTerm && <span className="ml-2">（全 {allSubmissions.length} 件中）</span>}
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
        {filteredSubmissions.length > 0 && (
          <div className="mb-4 text-sm text-gray-600">
            {startIndex + 1} - {Math.min(endIndex, filteredSubmissions.length)} 件目 / 全 {filteredSubmissions.length} 件
            {totalPages > 1 && (
              <span className="ml-4">
                ページ {currentPage} / {totalPages}
              </span>
            )}
          </div>
        )}

        {/* Submissions Cards */}
        <div className="space-y-4 mb-6">
          {currentSubmissions.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
              {searchTerm ? '検索条件に一致する申請がありません' : '申請がありません'}
            </div>
          ) : (
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
                          {submission.driverName || 'Unknown Driver'}
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
                        <div><span className="font-medium">運転手:</span> {submission.driverName || 'N/A'}</div>
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
              {startIndex + 1} - {Math.min(endIndex, filteredSubmissions.length)} / {filteredSubmissions.length} 件
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SafetyManagement; 