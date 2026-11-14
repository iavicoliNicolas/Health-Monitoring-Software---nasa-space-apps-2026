#pragma once

#include <string>
#include <vector>
#include <mutex>
#include <thread>
#include <atomic>
#include <functional>
#include <memory>

#if defined(_WIN32) || defined(_WIN64)
    #include <winsock2.h>
    #include <ws2tcpip.h>
    typedef SOCKET socket_t;
    #define INVALID_SOCKET_VAL INVALID_SOCKET
    #define SOCKET_ERROR_VAL SOCKET_ERROR
#else
    #include <sys/types.h>
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <arpa/inet.h>
    #include <unistd.h>
    typedef int socket_t;
    #define INVALID_SOCKET_VAL (-1)
    #define SOCKET_ERROR_VAL (-1)
#endif

namespace vitalgrid {

/**
 * @brief High-performance, self-contained RFC 6455 WebSocket Server
 */
class WebSocketServer {
public:
    using MessageCallback = std::function<void(socket_t client_socket, const std::string& message)>;

    explicit WebSocketServer(int port = 9002);
    ~WebSocketServer();

    /**
     * @brief Starts the server in a background listener thread
     */
    bool start();

    /**
     * @brief Gracefully terminates the server and all client connections
     */
    void stop();

    /**
     * @brief Broadcasts a UTF-8 text message to all active connected clients
     */
    void broadcast(const std::string& message);

    /**
     * @brief Sends a UTF-8 text message to a specific client
     */
    bool send_message(socket_t client_socket, const std::string& message);

    /**
     * @brief Registers callback for inbound messages from clients
     */
    void set_message_callback(MessageCallback cb) {
        std::lock_guard<std::mutex> lock(callback_mutex_);
        on_message_ = std::move(cb);
    }

    size_t connected_clients_count() const;

private:
    struct ClientSession {
        socket_t socket;
        bool is_handshake_done = false;
        std::thread worker;
    };

    struct ClientThreadEntry {
        std::thread thread;
        std::shared_ptr<std::atomic<bool>> finished;
    };

    void accept_loop();
    void handle_client(socket_t client_socket, std::shared_ptr<std::atomic<bool>> finished);
    bool perform_handshake(socket_t client_socket, const std::string& request);
    void close_client(socket_t client_socket);
    bool send_raw_frame(socket_t client_socket, uint8_t opcode, const std::string& payload);
    void reap_finished_threads();

    int port_;
    socket_t listen_socket_ = INVALID_SOCKET_VAL;
    std::atomic<bool> running_{false};
    std::thread accept_thread_;

    mutable std::mutex clients_mutex_;
    std::vector<socket_t> active_clients_;

    mutable std::mutex threads_mutex_;
    std::vector<ClientThreadEntry> client_threads_;

    mutable std::mutex send_mutex_;
    mutable std::mutex callback_mutex_;
    MessageCallback on_message_;
};

} // namespace vitalgrid
