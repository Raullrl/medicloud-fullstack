import { Component, ChangeDetectorRef, HostListener } from '@angular/core'; // ✨ Añadido HostListener
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
  cargando = false; 

  temporizadorSesion: any;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  // ✨ AÑADIDO: Sensor de actividad (Ratón, Teclado, Clics)
  // Cada vez que el usuario haga algo, este sensor se dispara
  @HostListener('window:mousemove')
  @HostListener('window:keydown')
  @HostListener('window:click')
  @HostListener('window:scroll')
  gestionarActividad() {
    // Si la sesión está iniciada, reiniciamos el reloj cada vez que el usuario se mueva
    if (this.sesionIniciada) {
      this.reiniciarRelojSeguridad();
    }
  }

  // ✨ AÑADIDO: Función para resetear la "bomba de relojería"
  reiniciarRelojSeguridad() {
    if (this.temporizadorSesion) {
      clearTimeout(this.temporizadorSesion);
    }
    
    // 15 minutos de margen desde el ÚLTIMO movimiento
    this.temporizadorSesion = setTimeout(() => {
      alert("⏱️ Sesión caducada por inactividad (Normativa RGPD). Por seguridad, vuelve a identificarte.");
      this.finalizarSesion();
    }, 900000); 
  }

  iniciarSesion() {
    this.cargando = true; 
    const paqueteDatos = { usuario: this.usuario, password: this.password };

    this.http.post('https://medicloud-backend-tuug.onrender.com/api/login', paqueteDatos).subscribe({
      next: (respuestaDelServidor: any) => {
        localStorage.setItem('token_medicloud', respuestaDelServidor.token);
        this.sesionIniciada = true; 
        this.cargando = false; 
        
        // ✨ Iniciamos el reloj por primera vez
        this.reiniciarRelojSeguridad();

        this.cdr.detectChanges(); 
      },
      error: (errorDelServidor) => {
        this.cargando = false; 
        this.cdr.detectChanges(); 
        
        if (errorDelServidor.status === 429) {
          alert('⛔ DEMASIADOS INTENTOS: IP bloqueada temporalmente.');
        } else {
          alert('⛔ ERROR: ' + (errorDelServidor.error?.error || 'Credenciales incorrectas'));
        }
      }
    });
  }

  finalizarSesion() {
    this.sesionIniciada = false;
    this.usuario = '';
    this.password = '';
    
    localStorage.removeItem('token_medicloud'); 
    if (this.temporizadorSesion) {
      clearTimeout(this.temporizadorSesion);
    }

    console.log("🔒 Sesión finalizada y temporizador destruido");
    this.cdr.detectChanges();
  }
}