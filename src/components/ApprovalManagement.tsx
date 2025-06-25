import React, { useState, useEffect } from 'react';
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import { ImageDisplay } from './ImageDisplay';
import { useAuth } from '../contexts/AuthContext';

import { isKachoLevel } from '../config/authConfig';

const client = generateClient<Schema>({
  authMode: 'apiKey'
});

interface ApprovalManagementProps {
  onBack?: () => void;
  user?: any;
}

const ApprovalManagement: React.FC<ApprovalManagementProps> = ({ onBack, user }) => {
  const { checkUserRole, graphService } = useAuth();
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  const [vehicleNames, setVehicleNames] = useState<{[key: string]: string}>({});
  const itemsPerPage = 10;



  useEffect(() => {
    loadPendingSubmissions();
  }, []);

  useEffect(() => {
    filterSubmissions();
  }, [searchTerm, pendingSubmissions, user]);

  // Resolve vehicle names when submissions change
  useEffect(() => {
    if (pendingSubmissions.length > 0 && graphService) {
      resolveVehicleNames();
    }
  }, [pendingSubmissions, graphService]);



  const loadPendingSubmissions = async () => {
    try {
      client.models.AlcoholCheckSubmission.observeQuery().subscribe({
        next: (data) => {
          const pending = data.items.filter(item => 
            item && item.id && item.approvalStatus === 'PENDING'
          );
          console.log('🔍 Loaded pending submissions:', pending.length);
          console.log('🔍 First few submissions:', pending.slice(0, 3).map(s => ({
            id: s.id,
            driverName: s.driverName,
            confirmerId: s.confirmerId,
            confirmedBy: s.confirmedBy,
            confirmerEmail: s.confirmerEmail,
            submittedBy: s.submittedBy
          })));
          setPendingSubmissions(pending);
        },
      });
    } catch (error) {
      console.error('Failed to load pending submissions:', error);
      setStatus('承認待ち一覧の読み込みに失敗しました');
    }
  };

  const resolveVehicleNames = async () => {
    if (!graphService) return;
    
    try {
      // Get unique vehicle IDs from submissions
      const vehicleIds = [...new Set(
        pendingSubmissions
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
    let filtered = pendingSubmissions;

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
      console.log('🔍 Filtering submissions for user:', user);
      console.log('🔍 User mailNickname:', user.mailNickname);
      console.log('🔍 User displayName:', user.displayName);
      console.log('🔍 User id:', user.id);
      console.log('🔍 User objectId:', user.objectId);
      console.log('🔍 User email:', user.email);
      console.log('🔍 All pending submissions:', pendingSubmissions);
      
      if (checkUserRole('SafeDrivingManager')) {
        // SafeDrivingManager can see all submissions
        console.log('🔍 User is SafeDrivingManager - showing all submissions');
      } else {
        // For regular users, only show submissions where they are the selected confirmer
        const originalFiltered = filtered;
        filtered = filtered.filter(submission => {
          console.log('🔍 Checking submission:', {
            id: submission.id,
            driverName: submission.driverName,
            confirmerId: submission.confirmerId,
            confirmedBy: submission.confirmedBy,
            confirmerEmail: submission.confirmerEmail,
            submittedBy: submission.submittedBy
          });
          
          // Check if current user is the selected confirmer using multiple possible identifiers
          const isSelectedConfirmer = 
            submission.confirmerId === user.mailNickname || 
            submission.confirmerId === user.id ||
            submission.confirmerId === user.objectId ||
            submission.confirmerId === user.email ||
            submission.confirmerEmail === user.email ||
            submission.confirmedBy === user.displayName ||
            submission.confirmedBy === user.mailNickname;
          
          console.log('🔍 Is selected confirmer?', isSelectedConfirmer);
          console.log('🔍 Match details:', {
            'confirmerId === mailNickname': submission.confirmerId === user.mailNickname,
            'confirmerId === id': submission.confirmerId === user.id,
            'confirmerId === objectId': submission.confirmerId === user.objectId,
            'confirmerId === email': submission.confirmerId === user.email,
            'confirmerEmail === email': submission.confirmerEmail === user.email,
            'confirmedBy === displayName': submission.confirmedBy === user.displayName,
            'confirmedBy === mailNickname': submission.confirmedBy === user.mailNickname
          });
          
          return isSelectedConfirmer;
        });
        
        // If no submissions matched exact criteria, show a warning and log detailed info
        if (filtered.length === 0 && originalFiltered.length > 0) {
          console.warn('⚠️ No submissions matched user identifiers exactly. This might indicate an ID mismatch issue.');
          console.warn('⚠️ User identifiers:', {
            mailNickname: user.mailNickname,
            id: user.id,
            objectId: user.objectId,
            email: user.email,
            displayName: user.displayName
          });
          console.warn('⚠️ All pending submissions with confirmer info:', originalFiltered.map(s => ({
            id: s.id,
            confirmerId: s.confirmerId,
            confirmedBy: s.confirmedBy,
            confirmerEmail: s.confirmerEmail
          })));
        }
      }
    }

    console.log('🔍 Filtered submissions:', filtered);
    setFilteredSubmissions(filtered);
    setCurrentPage(1);
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
      
      setStatus(`申請 ${submissionId} を承認しました`);
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      console.error('Approval failed:', error);
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
      
      setStatus(`申請 ${submissionId} を却下しました`);
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      console.error('Rejection failed:', error);
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
              あなたの役職: {user?.position || '一般'} (レベル{user?.jobLevel || 1}) | 
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
          <h2 className="text-lg font-bold mb-4">検索フィルター</h2>
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
                          {submission.driverName}
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
                      {submission.imageKey && (
                        <div className="md:col-span-2">
                          <h4 className="font-semibold text-gray-900 mb-3">確認写真</h4>
                          <ImageDisplay 
                            fileName={submission.imageKey}
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