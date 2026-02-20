import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule], 
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  @Output() cerrarSesionEvento = new EventEmitter<void>();
  
  mensajeServidor = '¡Bóveda Segura conectada!';
  cargandoBoveda: boolean = true; 

  esAdmin: boolean = false;
  tieneAccesoTotal: boolean = false; 
  nombreUsuario: string = '';
  vistaActual: 'boveda' | 'admin' = 'boveda'; 
  subVistaAdmin: 'usuarios' | 'auditoria' = 'usuarios'; 

  // ✨ NAVEGACIÓN JERÁRQUICA
  clienteSeleccionadoBoveda: string | null = null;
  clienteSeleccionadoAdmin: string | null = null;
  
  listaUsuarios: any[] = []; 
  logsAuditoria: any[] = []; 

  misCarpetas: any[] = []; 
  carpetas: any[] = []; 
  carpetaActual: any = null; 
  documentosDeCarpeta: any[] = []; 

  mostrarModalAlta: boolean = false;
  nuevoUsuario = { nombre: '', email: '', password: '', id_rol: 4 };

  mostrarModalUpload: boolean = false;
  subiendo: boolean = false;
  archivoSeleccionado: File | null = null;
  nuevoDoc = { nombre: '', criticidad: 'NORMAL', id_carpeta: '' }; 

  mostrarModalCarpeta: boolean = false;
  nuevaCarpetaNombre: string = '';
  creandoCarpeta: boolean = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.leerIdentidadUsuario(); 
    this.obtenerDatosCompletos(); 
  }

  // ✨ GETTERS PARA FILTRADO DINÁMICO
  get clientesUnicosBoveda() {
    const nombres = this.misCarpetas.map(c => c.cliente || 'Servicios Centrales');
    return [...new Set(nombres)];
  }

  get clientesUnicosAdmin() {
    const nombres = this.listaUsuarios.map(u => u.nombre_empresa || 'Identidades Internas');
    return [...new Set(nombres)];
  }

  // ✨ MÉTODOS DE NAVEGACIÓN
  seleccionarClienteBoveda(cliente: string) {
    this.clienteSeleccionadoBoveda = cliente;
    this.cdr.detectChanges();
  }

  volverAClientesBoveda() {
    this.clienteSeleccionadoBoveda = null;
    this.carpetaActual = null;
    this.cdr.detectChanges();
  }

  seleccionarClienteAdmin(cliente: string) {
    this.clienteSeleccionadoAdmin = cliente;
    this.cdr.detectChanges();
  }

  volverAClientesAdmin() {
    this.clienteSeleccionadoAdmin = null;
    this.cdr.detectChanges();
  }

  manejarErrorSeguridad(err: any) {
    if (err.status === 401 || err.status === 403) {
      alert("🔒 Tu sesión ha caducado o no tienes permisos. Por tu seguridad, vuelve a iniciar sesión.");
      this.cerrarSesion();
    } else {
      alert("❌ Error: " + (err.error?.error || err.message));
    }
    this.cargandoBoveda = false;
    this.cdr.detectChanges();
  }

  leerIdentidadUsuario() {
    const token = localStorage.getItem('token_medicloud');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.nombreUsuario = payload.nombre;
        this.esAdmin = (payload.rol === 3); 
        this.tieneAccesoTotal = (payload.rol === 3 || payload.rol === 1);
      } catch (e) { console.error("Error al leer el token", e); }
    }
  }

  cambiarVista(vista: 'boveda' | 'admin') {
    this.vistaActual = vista;
    if (vista === 'admin') {
      this.obtenerUsuariosAdmin();
      this.obtenerLogsAuditoria(); 
    }
    this.cdr.detectChanges();
  }

  cambiarSubVistaAdmin(subvista: 'usuarios' | 'auditoria') {
    this.subVistaAdmin = subvista;
    this.cdr.detectChanges();
  }

  obtenerDatosCompletos() {
    this.cargandoBoveda = true; 
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('https://medicloud-backend-tuug.onrender.com/api/mis-carpetas', { headers }).subscribe({
      next: (resCarpetas: any) => {
        this.misCarpetas = resCarpetas;
        this.http.get('https://medicloud-backend-tuug.onrender.com/api/carpetas', { headers }).subscribe({
          next: (resDocs: any) => {
            this.carpetas = resDocs.carpetas || resDocs;
            this.cargandoBoveda = false; 
            if (this.carpetaActual) this.entrarCarpeta(this.carpetaActual);
            this.cdr.detectChanges(); 
          },
          error: (err) => this.manejarErrorSeguridad(err)
        });
      },
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }

  entrarCarpeta(carpeta: any) {
    this.carpetaActual = carpeta;
    this.documentosDeCarpeta = this.carpetas.filter(doc => doc.ubicacion === carpeta.nombre);
    this.cdr.detectChanges();
  }

  volverACarpetas() {
    this.carpetaActual = null;
    this.documentosDeCarpeta = [];
    this.cdr.detectChanges();
  }

  buscarCarpeta(termino: string) {
    if (!termino.trim()) {
      this.volverACarpetas(); 
      this.clienteSeleccionadoBoveda = null;
      return;
    }
    this.cargandoBoveda = true;
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get(`https://medicloud-backend-tuug.onrender.com/api/carpetas/buscar?nombre=${termino}`, { headers }).subscribe({
      next: (respuesta: any) => {
        this.clienteSeleccionadoBoveda = 'Resultado de Búsqueda';
        this.carpetaActual = { nombre: `Búsqueda: "${termino}"` };
        this.documentosDeCarpeta = respuesta.carpetas || respuesta;
        this.cargandoBoveda = false;
        this.cdr.detectChanges();
      },
      error: (err) => this.manejarErrorSeguridad(err)
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
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }

  obtenerLogsAuditoria() {
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    this.http.get('https://medicloud-backend-tuug.onrender.com/api/admin/auditoria', { headers }).subscribe({
      next: (respuesta: any) => {
        this.logsAuditoria = respuesta.logs || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error("Error al cargar logs", err)
    });
  }

  abrirModalSubida() {
    this.mostrarModalUpload = true;
    if (this.carpetaActual && this.carpetaActual.id_carpeta) {
      this.nuevoDoc.id_carpeta = this.carpetaActual.id_carpeta;
    } else if (this.misCarpetas.length > 0) {
      this.nuevoDoc.id_carpeta = this.misCarpetas[0].id_carpeta;
    }
  }

  onFileSelected(event: any) { this.archivoSeleccionado = event.target.files[0]; }

  subirArchivo() {
    if (!this.archivoSeleccionado || !this.nuevoDoc.nombre || !this.nuevoDoc.id_carpeta) {
      alert("Faltan datos."); return;
    }
    this.subiendo = true;
    const formData = new FormData();
    formData.append('archivo', this.archivoSeleccionado);
    formData.append('nombre', this.nuevoDoc.nombre);
    formData.append('criticidad', this.nuevoDoc.criticidad);
    formData.append('id_carpeta', this.nuevoDoc.id_carpeta); 

    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.post('https://medicloud-backend-tuug.onrender.com/api/carpetas/upload', formData, { headers }).subscribe({
      next: (res: any) => {
        alert("✅ " + res.mensaje);
        this.mostrarModalUpload = false;
        this.subiendo = false;
        this.archivoSeleccionado = null;
        this.nuevoDoc = { nombre: '', criticidad: 'NORMAL', id_carpeta: '' };
        this.obtenerDatosCompletos(); 
      },
      error: (err) => { this.subiendo = false; this.manejarErrorSeguridad(err); }
    });
  }

  crearCarpeta() {
    if (!this.nuevaCarpetaNombre.trim()) return;
    this.creandoCarpeta = true;
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.post('https://medicloud-backend-tuug.onrender.com/api/carpetas', { nombre: this.nuevaCarpetaNombre }, { headers }).subscribe({
      next: (res: any) => {
        alert("✅ " + res.mensaje);
        this.mostrarModalCarpeta = false;
        this.nuevaCarpetaNombre = '';
        this.creandoCarpeta = false;
        this.obtenerDatosCompletos();
      },
      error: (err) => { this.creandoCarpeta = false; this.manejarErrorSeguridad(err); }
    });
  }

  eliminarCarpeta(carpeta: any, event: Event) {
    event.stopPropagation(); 
    if (!confirm(`¿Estás seguro de que deseas eliminar "${carpeta.nombre}"?`)) return;
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.delete(`https://medicloud-backend-tuug.onrender.com/api/carpetas/${carpeta.id_carpeta}`, { headers }).subscribe({
      next: (res: any) => { alert("✅ " + res.mensaje); this.obtenerDatosCompletos(); },
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }

  eliminarDocumento(doc: any) {
    if (!confirm(`¿Eliminar permanentemente "${doc.nombre_carpeta}"?`)) return;
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.delete(`https://medicloud-backend-tuug.onrender.com/api/documentos/${doc.id_documento}`, { headers }).subscribe({
      next: (res: any) => { alert("✅ " + res.mensaje); this.obtenerDatosCompletos(); },
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }

  cerrarSesion() {
    localStorage.removeItem('token_medicloud');
    this.cerrarSesionEvento.emit();
  }

  abrirDocumento(doc: any) {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.get(`https://medicloud-backend-tuug.onrender.com/api/documentos/${doc.id_documento}/url`, { headers }).subscribe({
      next: (res: any) => {
        window.open(res.url, '_blank');
      },
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }

  toggleEstado(usuario: any) {
    const nuevoEstado = usuario.estado === 'Bloqueado' ? 'Activo' : 'Bloqueado';
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.put(`https://medicloud-backend-tuug.onrender.com/api/admin/usuarios/${usuario.id_usuario}/estado`, { nuevoEstado }, { headers }).subscribe({
      next: () => { usuario.estado = nuevoEstado; this.cdr.detectChanges(); },
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }

  crearUsuario() {
    if (!this.nuevoUsuario.nombre || !this.nuevoUsuario.email || !this.nuevoUsuario.password) return;
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.post('https://medicloud-backend-tuug.onrender.com/api/admin/usuarios', this.nuevoUsuario, { headers }).subscribe({
      next: (res: any) => {
        alert("✅ " + res.mensaje);
        this.mostrarModalAlta = false;
        this.obtenerUsuariosAdmin(); 
        this.nuevoUsuario = { nombre: '', email: '', password: '', id_rol: 4 };
      },
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }

  resetearPassword(usuario: any) {
    const nuevaClave = prompt(`Escribe la nueva contraseña para ${usuario.nombre_usuario}:`);
    if (!nuevaClave) return;
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.put(`https://medicloud-backend-tuug.onrender.com/api/admin/usuarios/${usuario.id_usuario}/reset`, { nuevaClave }, { headers }).subscribe({
      next: (res: any) => alert("✅ " + res.mensaje),
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }

  eliminarUsuario(usuario: any) {
    if (!confirm(`🚨 CUIDADO: ¿Deseas eliminar permanentemente al usuario ${usuario.nombre_usuario}?`)) return;
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token_medicloud')}`);
    this.http.delete(`https://medicloud-backend-tuug.onrender.com/api/admin/usuarios/${usuario.id_usuario}`, { headers }).subscribe({
      next: (res: any) => { alert("✅ " + res.mensaje); this.obtenerUsuariosAdmin(); },
      error: (err) => this.manejarErrorSeguridad(err)
    });
  }
}