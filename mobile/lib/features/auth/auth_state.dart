enum AuthStatus { unknown, signedOut, signedIn }

class AuthUser {
  const AuthUser({required this.id, required this.email, required this.name, required this.role});

  final int id;
  final String email;
  final String name;
  final String role;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as int,
        email: json['email'] as String,
        name: json['name'] as String,
        role: json['role'] as String,
      );
}

class AuthState {
  const AuthState({required this.status, this.user, this.sessionExpiresAt});

  const AuthState.unknown() : this(status: AuthStatus.unknown);
  const AuthState.signedOut() : this(status: AuthStatus.signedOut);

  final AuthStatus status;
  final AuthUser? user;
  final DateTime? sessionExpiresAt;
}
