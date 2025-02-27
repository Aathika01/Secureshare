import React, { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import Peer from 'peerjs';
import { 
  Copy, 
  FileUp, 
  Moon, 
  Sun, 
  Users, 
  CheckCircle, 
  AlertCircle, 
  ArrowLeftRight,
  FileDown
} from 'lucide-react';

// Configuration for PeerJS
const peerConfig = {
  debug: 2,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  }
};

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode ? JSON.parse(savedMode) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [roomId, setRoomId] = useState('');
  const [joinMode, setJoinMode] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferStatus, setTransferStatus] = useState('');
  const [receivedFileName, setReceivedFileName] = useState('');
  const [receivedFileSize, setReceivedFileSize] = useState(0);
  const [receivedFileType, setReceivedFileType] = useState('');
  const [peerReady, setPeerReady] = useState(false);
  const [connectionReady, setConnectionReady] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<any>(null);
  const fileChunksRef = useRef<ArrayBuffer[]>([]);
  const totalChunksRef = useRef(0);
  const receivedChunksRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize peer connection
  useEffect(() => {
    if (!joinMode) {
      // Generate a unique room ID for the sender
      const newRoomId = uuidv4().substring(0, 8);
      setRoomId(newRoomId);
      
      // Initialize PeerJS for the sender
      const peer = new Peer(newRoomId, peerConfig);
      peerRef.current = peer;
      
      peer.on('open', (id) => {
        console.log('My peer ID is: ' + id);
        setConnectionStatus('waiting');
        setPeerReady(true);
        toast.success('Room created! Share the room code with the receiver.');
      });
      
      peer.on('connection', (conn) => {
        connectionRef.current = conn;
        setConnectionStatus('connecting');
        
        conn.on('open', () => {
          setConnectionStatus('connected');
          setConnectionReady(true);
          toast.success('Receiver connected! You can now send files.');
          
          // If a file was already selected, send it immediately
          if (selectedFile) {
            setTimeout(() => {
              sendFile(selectedFile);
            }, 500); // Small delay to ensure connection is fully established
          }
        });
        
        conn.on('data', (data) => {
          try {
            // Validate data is a string before processing
            if (data && typeof data === 'string' && data === 'FILE_RECEIVED_SUCCESSFULLY') {
              toast.success('File successfully received by the receiver!');
              setTransferStatus('completed');
            }
          } catch (error) {
            console.error('Error processing received data:', error);
          }
        });
        
        conn.on('close', () => {
          setConnectionStatus('disconnected');
          setConnectionReady(false);
          toast.error('Connection closed');
        });
        
        conn.on('error', (err) => {
          console.error('Connection error:', err);
          toast.error('Connection error: ' + (err.message || 'Unknown error'));
          setConnectionStatus('error');
          setConnectionReady(false);
        });
      });
      
      peer.on('error', (err) => {
        console.error('Peer error:', err);
        toast.error('Connection error: ' + (err.message || 'Unknown error'));
        setConnectionStatus('error');
        setPeerReady(false);
      });
      
      return () => {
        if (connectionRef.current) {
          connectionRef.current.close();
        }
        if (peerRef.current) {
          peerRef.current.destroy();
        }
        setPeerReady(false);
        setConnectionReady(false);
      };
    }
  }, [joinMode]);

  // Effect to handle sending file when connection becomes ready
  useEffect(() => {
    if (connectionReady && selectedFile && connectionStatus === 'connected') {
      sendFile(selectedFile);
    }
  }, [connectionReady, selectedFile, connectionStatus]);

  const joinRoom = () => {
    if (!joinRoomId.trim()) {
      toast.error('Please enter a valid room code');
      return;
    }

    try {
      const peer = new Peer(peerConfig);
      peerRef.current = peer;
      
      peer.on('open', () => {
        setPeerReady(true);
        const conn = peer.connect(joinRoomId, {
          reliable: true
        });
        connectionRef.current = conn;
        setConnectionStatus('connecting');
        
        conn.on('open', () => {
          setConnectionStatus('connected');
          setConnectionReady(true);
          toast.success('Connected to sender! Waiting for files...');
        });
        
        conn.on('data', (data) => {
          try {
            // Validate data before processing
            if (data !== null && data !== undefined) {
              handleReceivedData(data);
            } else {
              console.warn('Received null or undefined data');
            }
          } catch (error) {
            console.error('Error processing received data:', error);
            toast.error('Error processing received data');
          }
        });
        
        conn.on('close', () => {
          setConnectionStatus('disconnected');
          setConnectionReady(false);
          toast.error('Connection closed');
        });
        
        conn.on('error', (err) => {
          console.error('Connection error:', err);
          toast.error('Connection error: ' + (err.message || 'Unknown error'));
          setConnectionStatus('error');
          setConnectionReady(false);
        });
      });
      
      peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
          toast.error('Room not found. Please check the room code.');
        } else {
          toast.error('Connection error: ' + (err.message || 'Unknown error'));
        }
        setConnectionStatus('error');
        setPeerReady(false);
      });
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error('Failed to join room. Please try again.');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      
      if (connectionStatus === 'connected' && connectionRef.current && connectionReady) {
        sendFile(file);
      } else if (connectionStatus !== 'connected') {
        toast.info('File selected. It will be sent when the receiver connects.');
      } else {
        toast.info('File selected. Waiting for connection to be ready...');
      }
    }
  };

  const sendFile = (file: File) => {
    if (!connectionRef.current || connectionStatus !== 'connected' || !connectionReady) {
      toast.error('No active connection. Please wait for the receiver to connect.');
      return;
    }

    try {
      setTransferStatus('preparing');
      
      // Send file metadata first
      const metadata = {
        type: 'FILE_METADATA',
        name: file.name,
        size: file.size,
        fileType: file.type
      };
      
      connectionRef.current.send(metadata);
      
      // Then read and send the file in chunks
      const CHUNK_SIZE = 16384; // 16KB chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let chunksProcessed = 0;
      
      const reader = new FileReader();
      
      const sendNextChunk = (start: number) => {
        if (start >= file.size) {
          // All chunks sent
          setTimeout(() => {
            if (connectionRef.current && connectionReady) {
              connectionRef.current.send({
                type: 'FILE_COMPLETE'
              });
              setTransferStatus('sent');
            }
          }, 500); // Small delay to ensure all chunks are processed
          return;
        }
        
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        reader.onload = (e) => {
          if (e.target && e.target.result && connectionRef.current && connectionReady) {
            try {
              connectionRef.current.send({
                type: 'FILE_CHUNK',
                data: e.target.result,
                chunkIndex: chunksProcessed,
                totalChunks: totalChunks
              });
              
              chunksProcessed++;
              const progress = Math.round((chunksProcessed / totalChunks) * 100);
              setTransferProgress(progress);
              setTransferStatus('sending');
              
              // Process next chunk
              sendNextChunk(end);
            } catch (error) {
              console.error('Error sending chunk:', error);
              toast.error('Error sending file chunk. Please try again.');
              setTransferStatus('error');
            }
          } else {
            console.error('Connection not ready or reader result is null');
            toast.error('Connection not ready. Please try again.');
            setTransferStatus('error');
          }
        };
        
        reader.onerror = () => {
          console.error('Error reading file chunk');
          toast.error('Error reading file. Please try again.');
          setTransferStatus('error');
        };
        
        reader.readAsArrayBuffer(chunk);
      };
      
      // Start sending chunks
      sendNextChunk(0);
    } catch (error) {
      console.error('Error sending file:', error);
      toast.error('Failed to send file. Please try again.');
      setTransferStatus('error');
    }
  };

  const handleReceivedData = (data: any) => {
    try {
      // Validate data is an object with a type property
      if (!data || typeof data !== 'object') {
        console.warn('Received invalid data format:', typeof data);
        return;
      }

      if (data.type === 'FILE_METADATA') {
        // Reset for new file
        fileChunksRef.current = [];
        receivedChunksRef.current = 0;
        totalChunksRef.current = 0;
        
        setReceivedFileName(data.name || 'unknown');
        setReceivedFileSize(data.size || 0);
        setReceivedFileType(data.fileType || '');
        setTransferStatus('receiving');
        toast.info(`Receiving file: ${data.name || 'unknown'}`);
      } 
      else if (data.type === 'FILE_CHUNK') {
        // Validate chunk data exists
        if (!data.data) {
          console.warn('Received chunk without data');
          return;
        }

        if (!totalChunksRef.current && data.totalChunks) {
          totalChunksRef.current = data.totalChunks;
        }
        
        // Store the chunk
        if (data.chunkIndex !== undefined) {
          fileChunksRef.current[data.chunkIndex] = data.data;
          receivedChunksRef.current++;
          
          // Update progress
          const progress = Math.round((receivedChunksRef.current / totalChunksRef.current) * 100);
          setTransferProgress(progress);
          
          // Check if all chunks received
          if (progress === 100) {
            // If we've received all chunks but don't get the FILE_COMPLETE message,
            // trigger the download anyway after a short delay
            setTimeout(() => {
              if (transferStatus === 'receiving') {
                assembleAndDownloadFile();
              }
            }, 1000);
          }
        }
      } 
      else if (data.type === 'FILE_COMPLETE') {
        assembleAndDownloadFile();
      }
    } catch (error) {
      console.error('Error processing received data:', error);
      toast.error('Error processing received data');
    }
  };

  const assembleAndDownloadFile = () => {
    try {
      // Check if we have any chunks to assemble
      if (fileChunksRef.current.length === 0) {
        console.error('No file chunks to assemble');
        toast.error('Error downloading file: No data received');
        setTransferStatus('error');
        return;
      }
      
      // Combine all chunks into a single ArrayBuffer
      const fileSize = fileChunksRef.current.reduce((total, chunk) => {
        return total + (chunk ? chunk.byteLength : 0);
      }, 0);
      
      if (fileSize === 0) {
        console.error('File size is zero');
        toast.error('Error downloading file: Empty file');
        setTransferStatus('error');
        return;
      }
      
      const fileData = new Uint8Array(fileSize);
      let offset = 0;
      
      for (const chunk of fileChunksRef.current) {
        if (chunk) {
          fileData.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
      }
      
      // Create a Blob and download the file
      const blob = new Blob([fileData], { type: receivedFileType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = receivedFileName || 'downloaded_file';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      setTransferStatus('completed');
      toast.success('File downloaded successfully!');
      
      // Notify sender that file was received
      if (connectionRef.current && connectionReady) {
        connectionRef.current.send('FILE_RECEIVED_SUCCESSFULLY');
      }
    } catch (error) {
      console.error('Error assembling and downloading file:', error);
      toast.error('Error downloading file');
      setTransferStatus('error');
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId)
      .then(() => toast.success('Room code copied to clipboard!'))
      .catch(() => toast.error('Failed to copy room code'));
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    localStorage.setItem('darkMode', JSON.stringify(!darkMode));
  };

  const resetFileSelection = () => {
    setSelectedFile(null);
    setTransferProgress(0);
    setTransferStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const switchMode = () => {
    // Reset state when switching modes
    setJoinMode(!joinMode);
    setConnectionStatus('disconnected');
    setSelectedFile(null);
    setTransferProgress(0);
    setTransferStatus('');
    setJoinRoomId('');
    setPeerReady(false);
    setConnectionReady(false);
    
    // Close existing connections
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }
    
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'waiting': return 'text-blue-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'waiting': return 'Waiting for receiver...';
      case 'error': return 'Connection error';
      default: return 'Disconnected';
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'connecting': return <Users className="w-5 h-5 text-yellow-500" />;
      case 'waiting': return <Users className="w-5 h-5 text-blue-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <Users className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: darkMode ? '#374151' : '#ffffff',
            color: darkMode ? '#ffffff' : '#1f2937',
          },
        }}
      />
      
      {/* Header */}
      <header className={`p-4 flex justify-between items-center ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-md`}>
        <div className="flex items-center space-x-2">
          <FileUp className="w-6 h-6 text-blue-500" />
          <h1 className="text-xl font-bold">SecureShare</h1>
        </div>
        <button 
          onClick={toggleDarkMode}
          className={`p-2 rounded-full ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} transition-colors`}
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>
      
      {/* Main content */}
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-3xl">
        <div className={`rounded-lg shadow-lg p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          {/* Mode toggle */}
          <div className="mb-6 flex justify-center">
            <button 
              onClick={switchMode}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} transition-colors`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>{joinMode ? 'Create new room instead' : 'Join existing room instead'}</span>
            </button>
          </div>
          
          {/* Room creation or joining */}
          {!joinMode ? (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Share Files</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Your Room Code</label>
                <div className="flex">
                  <input
                    type="text"
                    value={roomId}
                    readOnly
                    className={`flex-1 px-4 py-2 rounded-l-md border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                  />
                  <button
                    onClick={copyRoomId}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-r-md flex items-center"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-500">Share this code with the receiver</p>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center space-x-2 mb-2">
                  {getStatusIcon()}
                  <span className={`${getStatusColor()}`}>{getStatusText()}</span>
                </div>
                
                {connectionStatus === 'connected' && (
                  <p className="text-sm text-green-500">Receiver connected! You can now send files.</p>
                )}
                
                {connectionStatus === 'waiting' && (
                  <p className="text-sm text-blue-500">Waiting for receiver to join using your room code...</p>
                )}
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Select File to Send</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-input"
                />
                <label
                  htmlFor="file-input"
                  className={`flex items-center justify-center px-4 py-2 border border-dashed rounded-md cursor-pointer ${
                    darkMode 
                      ? 'border-gray-600 hover:border-gray-500 bg-gray-700 hover:bg-gray-600' 
                      : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
                  } transition-colors`}
                >
                  <FileUp className="w-5 h-5 mr-2 text-blue-500" />
                  <span>{selectedFile ? selectedFile.name : 'Choose a file'}</span>
                </label>
                
                {selectedFile && (
                  <div className="mt-2">
                    <p className="text-sm">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                    </p>
                    <button
                      onClick={resetFileSelection}
                      className="text-sm text-red-500 hover:text-red-600 mt-1"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              
              {transferStatus && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2">Transfer Status</h3>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div 
                      className="bg-blue-500 h-2.5 rounded-full" 
                      style={{ width: `${transferProgress}%` }}
                    ></div>
                  </div>
                  <p className="mt-2 text-sm">
                    {transferStatus === 'preparing' && 'Preparing file...'}
                    {transferStatus === 'sending' && `Sending... ${transferProgress}%`}
                    {transferStatus === 'sent' && 'File sent! Waiting for receiver to download...'}
                    {transferStatus === 'completed' && 'File successfully received by the receiver!'}
                    {transferStatus === 'error' && 'Error sending file. Please try again.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Join Room to Receive Files</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Enter Room Code</label>
                <div className="flex">
                  <input
                    type="text"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                    placeholder="Enter room code"
                    className={`flex-1 px-4 py-2 rounded-l-md border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                  />
                  <button
                    onClick={joinRoom}
                    disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'}
                    className={`px-4 py-2 bg-blue-500 text-white rounded-r-md flex items-center ${
                      connectionStatus === 'connected' || connectionStatus === 'connecting'
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-blue-600'
                    }`}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Join Room
                  </button>
                </div>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center space-x-2 mb-2">
                  {getStatusIcon()}
                  <span className={`${getStatusColor()}`}>{getStatusText()}</span>
                </div>
                
                {connectionStatus === 'connected' && (
                  <p className="text-sm text-green-500">Connected to sender! Waiting for files...</p>
                )}
              </div>
              
              {transferStatus && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2">
                    {transferStatus === 'receiving' ? 'Receiving File' : 'File Transfer'}
                  </h3>
                  
                  {receivedFileName && (
                    <div className="flex items-center mb-2">
                      <FileDown className="w-5 h-5 mr-2 text-blue-500" />
                      <span>{receivedFileName} ({(receivedFileSize / 1024).toFixed(2)} KB)</span>
                    </div>
                  )}
                  
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div 
                      className="bg-blue-500 h-2.5 rounded-full" 
                      style={{ width: `${transferProgress}%` }}
                    ></div>
                  </div>
                  <p className="mt-2 text-sm">
                    {transferStatus === 'receiving' && `Receiving... ${transferProgress}%`}
                    {transferStatus === 'completed' && 'File downloaded successfully!'}
                    {transferStatus === 'error' && 'Error receiving file.'}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Instructions */}
          <div className={`p-4 rounded-md ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <h3 className="font-medium mb-2">How it works</h3>
            <ul className="list-disc list-inside text-sm space-y-1">
              {!joinMode ? (
                <>
                  <li>Share your room code with the receiver</li>
                  <li>Wait for them to join your room</li>
                  <li>Select a file to send once connected</li>
                  <li>The file will be sent directly to the receiver</li>
                </>
              ) : (
                <>
                  <li>Enter the room code shared by the sender</li>
                  <li>Click "Join Room" to connect</li>
                  <li>Wait for the sender to select a file</li>
                  <li>The file will download automatically when received</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className={`p-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
        <p>SecureShare - Secure P2P File Sharing</p>
        <p className="text-xs mt-1">Files are transferred directly between peers with no server storage</p>
      </footer>
    </div>
  );
}

export default App;