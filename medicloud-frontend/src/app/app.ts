import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DashboardComponent } from './dashboard/dashboard'; 

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, DashboardComponent], 
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  usuario = '';
  password = '';
  sesionIniciada = false; 

  constructor(private http: HttpClient) {}

  iniciarSesion() {
    const paqueteDatos = { usuario: this.usuario, password: this.password };

    // URL corregida con 'tuug'
    this.http.post('https://medicloud-backend-tuug.onrender.com/api/login', paqueteDatos).subscribe({
      next: (respuestaDelServidor: any) => {
        localStorage.setItem('token_medicloud', respuestaDelServidor.token);
        this.sesionIniciada = true; 
        console.log("✅ Login exitoso");
      },
      error: (errorDelServidor) => {
        alert('⛔ ERROR: ' + (errorDelServidor.error.error || 'Fallo en la conexión'));
      }
    });
  }

  // Esta función se activará cuando el Dashboard "grite" que quiere cerrar sesión
  finalizarSesion() {
    this.sesionIniciada = false;
    this.usuario = '';
    this.password = '';
    console.log("🔒 Sesión finalizada en App");
  }
}