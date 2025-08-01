import React, { useState, useEffect } from 'react';
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import { ImageDisplay } from './ImageDisplay';
import { useAuth } from '../contexts/AuthContext';
import { getSubmissionsPaginated, getDriversPaginated, getSubmissionsByConfirmerPaginated } from '../utils/paginationHelper';
import { logger } from '../utils/logger';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

import { isKachoLevel } from '../config/authConfig';

const client = generateClient<Schema>({
  authMode: 'apiKey'
});

const lambdaClient = new LambdaClient({ region: 'ap-northeast-1' }); // Set your AWS region

const logToCloudWatch = async (logData: any) => {
  try {
    // Fix: Use TextEncoder instead of Buffer for browser compatibility
    const encoder = new TextEncoder();
    const payload = encoder.encode(JSON.stringify(logData));
    
    await lambdaClient.send(new InvokeCommand({
      FunctionName: 'log-approval-issue', // The Lambda function name
      Payload: payload,
    }));
  } catch (err) {
    // Optionally log to console if CloudWatch logging fails
    console.error('Failed to log to CloudWatch:', err);
  }
};

interface ApprovalManagementProps {
  onBack?: () => void;
  user?: any;
}

const ApprovalManagement: React.FC<ApprovalManagementProps> = ({ onBack, user }) => {
  const { checkUserRole, graphService } = useAuth();
  
  // Server-side pagination state
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [totalLoaded, setTotalLoaded] = useState(0);
  
  // Legacy states
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
 
  const [vehicleNames, setVehicleNames] = useState<{[key: string]: string}>({});
  const [driverNames, setDriverNames] = useState<{[key: string]: string}>({}); // Map mailNickname to actual name
  const itemsPerPage = 20; // Increased for better performance



  useEffect(() => {
    loadPendingSubmissions(false); // Don't show refresh status on initial load
  }, []);

  useEffect(() => {
    filterSubmissions();
  }, [searchTerm, user, pendingSubmissions]);

  // Separate useEffect to reset page only when search/filter criteria change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Resolve vehicle names and driver names when submissions change
  useEffect(() => {
    if (pendingSubmissions.length > 0) {
      if (graphService) {
        resolveVehicleNames();
      }
      resolveDriverNames();
    }
  }, [pendingSubmissions.length, graphService]);

  // NEW: Auto-refresh when page becomes visible to handle database consistency
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        logger.debug('Page became visible, refreshing approval data for consistency...');
        // Delay slightly to ensure any recent submissions are available
        setTimeout(() => {
          loadPendingSubmissions(false);
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

    // NEW: Load initial pending submissions with pagination
  const loadPendingSubmissions = async (showRefreshStatus = true) => {
    setIsLoading(true);
    try {
      // Add user validation to prevent errors
      if (!user) {
        throw new Error('User information not available');
      }

      if (showRefreshStatus) {
        setStatus('承認待ち申請を読み込み中...');
      }
      logger.info('Loading pending submissions with server-side pagination...');
      
      let result;
      if (checkUserRole('SafeDrivingManager')) {
        // Admin: fetch all pending submissions
        result = await getSubmissionsPaginated({
          approvalStatus: 'PENDING',
          limit: 200,
          sortDirection: 'DESC'
        });
      } else {
        // Non-admin: fetch only submissions where user is confirmer
        // Fix: Use azureId first since that's what's stored as confirmerId in the database
        const userIdentifier = user?.azureId || user?.id || user?.objectId || user?.mailNickname || user?.email;
        
        if (!userIdentifier) {
          throw new Error('Unable to determine user identifier for confirmer query');
        }
        
        result = await getSubmissionsByConfirmerPaginated({
          confirmerId: userIdentifier,
          approvalStatus: 'PENDING',
          limit: 20000, // FIXED: Increased to 20000 for large datasets
          sortDirection: 'DESC'
        });
      }
      
      // Fix: Add null checks for result
      if (!result || !result.items) {
        throw new Error('Invalid response from server');
      }
      
      const pendingSubmissions = result.items;
      logger.info(`Loaded ${pendingSubmissions.length} pending submissions`);
      setPendingSubmissions(pendingSubmissions);
      setNextToken(result.nextToken);
      setHasMore(result.hasMore);
      setTotalLoaded(pendingSubmissions.length);
      setStatus(`✅ ${pendingSubmissions.length}件の承認待ち申請を読み込みました${result.hasMore ? ' - 過去の申請をさらに読み込み可能' : ''}`);
    } catch (error) {
      logger.error('Failed to load pending submissions:', error);
      setStatus('承認待ち申請の読み込みに失敗しました: ' + (error instanceof Error ? error.message : 'Unknown error'));
      
      // Fix: Initialize empty state on error to prevent further errors
      setPendingSubmissions([]);
      setNextToken(undefined);
      setHasMore(false);
      setTotalLoaded(0);
      
      // Log to CloudWatch
      logToCloudWatch({
        error: error instanceof Error ? error.message : error,
        user: {
          mailNickname: user?.mailNickname,
          email: user?.email,
          id: user?.id,
          objectId: user?.objectId,
          azureId: user?.azureId,
          displayName: user?.displayName,
        },
        timestamp: new Date().toISOString(),
        context: 'loadPendingSubmissions',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: Load more submissions when user clicks "Load More"
  const loadMoreSubmissions = async () => {
    if (!hasMore || isLoading) return;
    setIsLoading(true);
    try {
      logger.debug('Loading more submissions...');
      setStatus('過去の承認待ち申請を読み込み中...');
      let result;
      if (checkUserRole('SafeDrivingManager')) {
        result = await getSubmissionsPaginated({
          approvalStatus: 'PENDING',
          limit: 50,
          nextToken: nextToken,
          sortDirection: 'DESC'
        });
      } else {
        const userIdentifier = user?.mailNickname || user?.email || user?.id || user?.objectId || user?.azureId;
        if (!userIdentifier) throw new Error('Unable to determine user identifier for confirmer query');
        result = await getSubmissionsByConfirmerPaginated({
          confirmerId: userIdentifier,
          approvalStatus: 'PENDING',
          limit: 20000, // FIXED: Increased to 20000 for large datasets
          nextToken: nextToken,
          sortDirection: 'DESC'
        });
      }
      
      // Fix: Add null checks for result
      if (!result || !result.items) {
        throw new Error('Invalid response from server');
      }
      
      const newPendingSubmissions = result.items;
      logger.debug(`Loaded ${newPendingSubmissions.length} additional pending submissions`);
      const allPendingSubmissions = [...pendingSubmissions, ...newPendingSubmissions];
      setPendingSubmissions(allPendingSubmissions);
      setNextToken(result.nextToken);
      setHasMore(result.hasMore);
      setTotalLoaded(prev => prev + newPendingSubmissions.length);
      setStatus(`✅ ${allPendingSubmissions.length}件の承認待ち申請を読み込みました${result.hasMore ? ' - 過去の申請をさらに読み込み可能' : ''}`);
    } catch (error) {
      logger.error('Failed to load more submissions:', error);
      setStatus('追加データの読み込みに失敗しました: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const resolveVehicleNames = async () => {
    if (!graphService) {
      return;
    }
    
    try {
      // Get unique vehicle IDs from submissions
      const vehicleIds = [...new Set(
        pendingSubmissions
          .map(sub => sub.vehicle)
          .filter(id => id && !vehicleNames[id])
      )];

      if (vehicleIds.length === 0) {
        return;
      }

      logger.debug('Resolving vehicle names for', vehicleIds.length, 'vehicles');
      
      const resolved = await graphService.resolveVehicleIds(vehicleIds);
      
      // Fix: Add null check before using Object.keys
      if (resolved && typeof resolved === 'object') {
        setVehicleNames(prev => ({ ...prev, ...resolved }));
        logger.debug('Resolved', Object.keys(resolved).length, 'vehicle names');
      } else {
        logger.warn('Invalid response from resolveVehicleIds:', resolved);
      }
    } catch (error) {
      logger.error('Failed to resolve vehicle names:', error);
    }
  };

  const resolveDriverNames = async () => {
    try {
      const driverMap: {[key: string]: string} = {};
      
      // Get unique driver identifiers from submissions (these are mailNicknames)
      const uniqueDrivers = [...new Set(pendingSubmissions.map(s => s.driverName).filter(Boolean))];
      
      logger.debug('Resolving driver names for', uniqueDrivers.length, 'drivers');
      
      // Load drivers using new paginated approach
      const driversResult = await getDriversPaginated({ 
        excludeDeleted: true,
        limit: 100 // Load more drivers at once for mapping
      });
      
      // Fix: Add null check for driversResult
      if (!driversResult || !driversResult.items) {
        logger.warn('Invalid response from getDriversPaginated');
        return;
      }
      
      logger.debug('Loaded drivers from schema:', driversResult.items.length);
      
      for (const mailNickname of uniqueDrivers) {
        // Find the driver by matching the mailNickname with the email prefix
        const matchedDriver = driversResult.items.find(driver => {
          if (!driver.mail) return false;
          const emailPrefix = driver.mail.split('@')[0].toLowerCase();
          return emailPrefix === mailNickname.toLowerCase();
        });
        
        if (matchedDriver && matchedDriver.name) {
          driverMap[mailNickname] = matchedDriver.name;
          logger.debug(`Resolved driver name successfully`);
        } else {
          logger.debug(`Could not resolve driver name`);
        }
      }
      
      logger.debug('Final driver mapping completed:', Object.keys(driverMap).length, 'drivers resolved');
      setDriverNames(driverMap);
    } catch (error) {
      logger.error('Error resolving driver names:', error);
    }
  };

  const filterSubmissions = () => {
    // Fix: Ensure pendingSubmissions is always an array
    let filtered = Array.isArray(pendingSubmissions) ? pendingSubmissions : [];

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(submission => 
        submission.driverName?.toLowerCase().includes(term) ||
        submission.vehicle?.toLowerCase().includes(term) ||
        submission.destination?.toLowerCase().includes(term) ||
        submission.submittedBy?.toLowerCase().includes(term)
      );
    }

    // Apply role-based filtering - show only submissions where current user is the selected confirmer
    if (user) {
      const isSafeDrivingManager = checkUserRole('SafeDrivingManager');
      
      if (isSafeDrivingManager) {
        // SafeDrivingManager can see all submissions
      } else {
        // For regular users, only show submissions where they are the selected confirmer
        filtered = filtered.filter((submission) => {
          // Check if current user is the selected confirmer using multiple possible identifiers
          const isSelectedConfirmer = 
            submission.confirmerId === user.mailNickname ||
            submission.confirmerId === user.id ||
            submission.confirmerId === user.objectId ||
            submission.confirmerId === user.email ||
            submission.confirmerId === user.azureId ||
            submission.confirmerEmail === user.email ||
            submission.confirmedBy === user.displayName ||
            submission.confirmedBy === user.mailNickname;
          
          return isSelectedConfirmer;
        });
      }
    }

    setFilteredSubmissions(filtered);
  };



  const handleApprove = async (submissionId: string) => {
    // Find the submission to check if user is the selected confirmer
    const submission = filteredSubmissions.find(s => s.id === submissionId);
    if (!submission) {
      alert('申請が見つかりません');
      return;
    }

    // Check if current user is the selected confirmer for this submission
    const isSelectedConfirmer = 
      submission.confirmerId === user.mailNickname || 
      submission.confirmerId === user.id ||
      submission.confirmerId === user.objectId ||
      submission.confirmerId === user.email ||
      submission.confirmerEmail === user.email ||
      submission.confirmedBy === user.displayName ||
      submission.confirmedBy === user.mailNickname;

    if (!isSelectedConfirmer && !checkUserRole('SafeDrivingManager')) {
      alert('この申請を承認する権限がありません');
      return;
    }

    try {
      await client.models.AlcoholCheckSubmission.update({
        id: submissionId,
        approvalStatus: 'APPROVED',
        approvedBy: user?.displayName || user?.email || 'Unknown',
        approvedAt: new Date().toISOString(),
      });
      
      // Remove the approved submission from local state to update UI immediately
      setPendingSubmissions(prev => prev.filter(sub => sub.id !== submissionId));
      
      setStatus(`申請 ${submissionId} を承認しました`);
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      setStatus('承認処理に失敗しました');
    }
  };

  const handleReject = async (submissionId: string) => {
    // Find the submission to check if user is the selected confirmer
    const submission = filteredSubmissions.find(s => s.id === submissionId);
    if (!submission) {
      alert('申請が見つかりません');
      return;
    }

    // Check if current user is the selected confirmer for this submission
    const isSelectedConfirmer = 
      submission.confirmerId === user.mailNickname || 
      submission.confirmerId === user.id ||
      submission.confirmerId === user.objectId ||
      submission.confirmerId === user.email ||
      submission.confirmerEmail === user.email ||
      submission.confirmedBy === user.displayName ||
      submission.confirmedBy === user.mailNickname;

    if (!isSelectedConfirmer && !checkUserRole('SafeDrivingManager')) {
      alert('この申請を却下する権限がありません');
      return;
    }

    const reason = prompt('却下理由を入力してください:');
    if (!reason) return;

    try {
      await client.models.AlcoholCheckSubmission.update({
        id: submissionId,
        approvalStatus: 'REJECTED',
        approvedBy: user?.displayName || user?.email || 'Unknown',
        approvedAt: new Date().toISOString(),
        // rejectionReason: reason, // TODO: Add rejectionReason to schema
      });
      
      // Remove the rejected submission from local state to update UI immediately
      setPendingSubmissions(prev => prev.filter(sub => sub.id !== submissionId));
      
      setStatus(`申請 ${submissionId} を却下しました`);
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      setStatus('却下処理に失敗しました');
    }
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

  // Pagination
  const totalPages = Math.ceil(filteredSubmissions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentSubmissions = filteredSubmissions
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(startIndex, startIndex + itemsPerPage);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full mx-4">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">ログインが必要です</h2>
            <p className="text-gray-600 mb-6">
              この機能にアクセスするにはログインが必要です。
            </p>
            {onBack && (
              <button
                onClick={onBack}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              >
                戻る
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-orange-500 text-white p-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">承認管理</h1>
            <p className="text-sm opacity-90">
              承認待ち: {filteredSubmissions.length}件 | 
              あなたの役職: {user?.position || user?.jobTitle || '一般'} (レベル{user?.jobLevel || 1}) | 
              権限: {user?.role === 'SafeDrivingManager' ? '安全運転管理者' : 
                    user?.role === 'Manager' ? '管理者' : 
                    isKachoLevel(user?.jobLevel || 1) ? '課長レベル' : '一般'}
            </p>
          </div>
          {onBack && (
            <button 
              onClick={onBack}
              className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded text-sm"
            >
              ← 戻る
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Status Message */}
        {status && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
            {status}
          </div>
        )}



        {/* Search Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">検索フィルター</h2>
            {/* Load More Button */}
            {hasMore && (
              <button
                onClick={loadMoreSubmissions}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    読み込み中...
                  </>
                ) : (
                  <>
                    📥 過去の申請を読み込み
                  </>
                )}
              </button>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="運転手名、車両、目的地で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>
          {/* Show load status */}
          {totalLoaded > 0 && (
            <div className="mt-3 text-sm text-gray-600">
              読み込み済み: {totalLoaded}件{hasMore ? ' (過去の申請をさらに読み込み可能)' : ' (全件読み込み完了)'}
            </div>
          )}
        </div>

        {/* Submissions List */}
        <div className="space-y-4">
          {currentSubmissions.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">承認待ちの申請はありません</h3>
              <p className="text-gray-500">現在、あなたが承認できる申請はありません。</p>
            </div>
          ) : (
            currentSubmissions.map((submission) => (
              <div key={submission.id} className="bg-white rounded-lg shadow-md border-l-4 border-orange-500">
                <div 
                  className="p-6 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleCard(submission.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {getResolvedDriverName(submission.driverName)}
                        </h3>
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 border border-orange-300">
                          承認待ち
                        </span>
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-300">
                          {submission.registrationType}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">車両:</span> {(submission.vehicle && vehicleNames[submission.vehicle]) || submission.vehicle || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">申請者:</span> {submission.submittedBy}
                        </div>
                        <div>
                          <span className="font-medium">申請日時:</span> {formatDate(submission.submittedAt)}
                        </div>
                      </div>
                    </div>
                    
                    {/* Show approve/deny buttons - if submission is shown to user, they can approve it */}
                    {(() => {
                      // Check if current user is the selected confirmer for this submission
                      const isSelectedConfirmer = 
                        submission.confirmerId === user.mailNickname || 
                        submission.confirmerId === user.id ||
                        submission.confirmerId === user.objectId ||
                        submission.confirmerId === user.email ||
                        submission.confirmerEmail === user.email ||
                        submission.confirmedBy === user.displayName ||
                        submission.confirmedBy === user.mailNickname;
                      
                      const canApprove = isSelectedConfirmer || checkUserRole('SafeDrivingManager');
                      
                      return canApprove ? (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(submission.id);
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                          >
                            承認
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReject(submission.id);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                          >
                            却下
                          </button>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 italic">
                          この申請を承認する権限がありません
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedCards.has(submission.id) && (
                  <div className="border-t border-gray-200 p-6 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Basic Information */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3">基本情報</h4>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">目的地:</span> {submission.destination || 'N/A'}</div>
                          <div><span className="font-medium">住所:</span> {submission.address || 'N/A'}</div>
                          <div><span className="font-medium">目的:</span> {submission.purpose || 'N/A'}</div>
                          <div><span className="font-medium">乗車時刻:</span> {submission.boardingDateTime || 'N/A'}</div>
                          <div><span className="font-medium">降車予定時刻:</span> {submission.alightingDateTime || 'N/A'}</div>
                        </div>
                      </div>

                      {/* Safety Checks */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3">安全確認</h4>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">免許証:</span> {submission.hasLicense ? '✓ 確認済み' : '✗ 未確認'}</div>
                          <div><span className="font-medium">アルコール:</span> {submission.noAlcohol ? '✓ 飲酒なし' : '✗ 未確認'}</div>
                          <div><span className="font-medium">運転集中:</span> {submission.focusOnDriving ? '✓ 確認済み' : '✗ 未確認'}</div>
                          <div><span className="font-medium">車両点検:</span> {submission.vehicleInspection ? '✓ 実施済み' : '✗ 未実施'}</div>
                        </div>
                      </div>

                      {/* Alcohol Test Results */}
                      {submission.inspectionResult && (
                        <div className="md:col-span-2">
                          <h4 className="font-semibold text-gray-900 mb-3">アルコールチェック結果</h4>
                          <div className="bg-white p-4 rounded border">
                            <div className="text-sm">
                              <div><span className="font-medium">測定値:</span> {submission.inspectionResult}</div>
                              <div><span className="font-medium">コメント:</span> {submission.communicationMessage || 'なし'}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Image */}
                      {(submission.registrationType === '運転終了登録' || submission.registrationType === '中間点呼登録' ? submission.imageKeyEnd : submission.imageKey) && (
                        <div className="md:col-span-2">
                          <h4 className="font-semibold text-gray-900 mb-3">確認写真</h4>
                          <ImageDisplay 
                            fileName={submission.registrationType === '運転終了登録' || submission.registrationType === '中間点呼登録' ? submission.imageKeyEnd : submission.imageKey}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <div className="flex gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-2 rounded text-sm font-medium ${
                    currentPage === page
                      ? 'bg-orange-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovalManagement; 