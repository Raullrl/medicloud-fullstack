import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // ✨ Añadido para los formularios

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule], // ✨ Añadido FormsModule aquí
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  @Output() cerrarSesionEvento = new EventEmitter<void>();
  
  mensajeServidor = '¡Bóveda Segura de MediCloud conectada!';
  carpetas: any[] = [];
  
  cargandoBoveda: boolean = true; 

  esAdmin: boolean = false;
  tieneAccesoTotal: boolean = false; 
  nombreUsuario: string = '';
  vistaActual: 'boveda' | 'admin' = 'boveda'; 
  listaUsuarios: any[] = []; 

  // ✨ NUEVAS VARIABLES PARA EL MODAL DE ALTA
  mostrarModalAlta: boolean = false;
  nuevoUsuario = { nombre: '', email: '', password: '', id_rol: 4 };

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.leerIdentidadUsuario(); 
    this.obtenerCarpetas();
  }

  leerIdentidadUsuario() {
    const token = localStorage.getItem('token_medicloud');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.nombreUsuario = payload.nombre;
        this.esAdmin = (payload.rol === 3); 
        this.tieneAccesoTotal = (payload.rol === 3 || payload.rol === 1);
      } catch (e) {
        console.error("Error al leer el token", e);
      }
    }
  }

  cambiarVista(vista: 'boveda' | 'admin') {
    this.vistaActual = vista;
    if (vista === 'admin') {
      this.obtenerUsuariosAdmin();
    }
    this.cdr.detectChanges();
  }

  buscarCarpeta(termino: string) {
    if (!termino.trim()) {
      this.obtenerCarpetas(); 
      return;
    }

    this.cargandoBoveda = true;
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get(`https://medicloud-backend-tuug.onrender.com/api/carpetas/buscar?nombre=${termino}`, { headers }).subscribe({
      next: (respuesta: any) => {
        this.carpetas = respuesta.carpetas || respuesta;
        this.cargandoBoveda = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("❌ Error en búsqueda:", err);
        this.cargandoBoveda = false;
        this.cdr.detectChanges();
      }
    });
  }

  obtenerUsuariosAdmin() {
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('https://medicloud-backend-tuug.onrender.com/api/admin/usuarios', { headers }).subscribe({
      next: (respuesta: any) => {
        this.listaUsuarios = respuesta.usuarios || respuesta;
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert("⛔ Acceso denegado. No tienes permisos de Administrador.");
        this.cambiarVista('boveda');
      }
    });
  }

  obtenerCarpetas() {
    this.cargandoBoveda = true; 
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('https://medicloud-backend-tuug.onrender.com/api/carpetas', { headers }).subscribe({
      next: (respuesta: any) => {
        if (respuesta && respuesta.carpetas) {
          this.carpetas = respuesta.carpetas;
        } else if (Array.isArray(respuesta)) {
          this.carpetas = respuesta;
        }
        this.cargandoBoveda = false; 
        this.cdr.detectChanges(); 
      },
      error: (err) => {
        console.error("❌ Error al obtener carpetas:", err);
        this.cargandoBoveda = false; 
        this.cdr.detectChanges();
      }
    });
  }

  cerrarSesion() {
    localStorage.removeItem('token_medicloud');
    this.cerrarSesionEvento.emit();
  }

  abrirCarpeta(url: string) {
    if (url) {
      window.open(url, '_blank');
    } else {
      alert("No hay archivo disponible para esta carpeta.");
    }
  }

  // ✨ NUEVA FUNCIÓN: CAMBIAR ESTADO (BLOQUEAR/ACTIVAR)
  toggleEstado(usuario: any) {
    const nuevoEstado = usuario.estado === 'Bloqueado' ? 'Activa' : 'Bloqueado';
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.put(`https://medicloud-backend-tuug.onrender.com/api/admin/usuarios/${usuario.id_usuario}/estado`, 
    { nuevoEstado }, { headers }).subscribe({
      next: () => {
        usuario.estado = nuevoEstado;
        this.cdr.detectChanges();
      },
      error: () => alert("Error al modificar el estado. Revisa tus permisos.")
    });
  }

  // ✨ NUEVA FUNCIÓN: ALTA DE USUARIO
  crearUsuario() {
    if (!this.nuevoUsuario.nombre || !this.nuevoUsuario.email || !this.nuevoUsuario.password) {
      alert("Por favor, rellena todos los campos.");
      return;
    }

    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.post('https://medicloud-backend-tuug.onrender.com/api/admin/usuarios', this.nuevoUsuario, { headers }).subscribe({
      next: (res: any) => {
        alert(res.mensaje);
        this.mostrarModalAlta = false; // Cierra la ventana
        this.obtenerUsuariosAdmin();   // Recarga la tabla
        this.nuevoUsuario = { nombre: '', email: '', password: '', id_rol: 4 }; // Limpia el formulario
      },
      error: () => alert("Error al crear el usuario. El correo podría estar ya en uso.")
    });
  }
}