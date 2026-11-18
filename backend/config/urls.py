"""
URLConf raíz del proyecto.

Las rutas de la API se versionan bajo /api/v1/.
"""
from urllib.parse import urlparse,urlunparse

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.shortcuts import redirect
from django.urls import include,path,re_path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView
)

from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenRefreshView,
    TokenVerifyView
)
from rest_framework.routers import DefaultRouter

from spaces.views import SpaceViewSet, SpaceResponsibilityViewSet
from reservations.views import ReservationViewSet
from users.api_views import PublicRegistrationView
from users.mfa_views import (
    MFAConfirmView,
    MFACookieVerifyView,
    MFADisableView,
    MFARecoveryCodesView,
    MFASetupView,
    MFAStatusView,
    MFAVerifyView,
)
from users.views import UserViewSet
from branches.api_views import (
    AreaViewSet,
    BranchViewSet,
    CityViewSet,
    DepartmentViewSet,
    LocationViewSet,
)

from common.views import (
    CookieTokenLogoutView,
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    HealthView,
    ThrottleTokenObtainPairView,
)

_LOOPBACK = {"localhost","127.0.0.1","0.0.0.0"}

api_router = DefaultRouter()
api_router.register("spaces", SpaceViewSet, basename="space")
api_router.register("reservations", ReservationViewSet, basename="reservation")
api_router.register("users", UserViewSet, basename="user")
api_router.register("responsibilities", SpaceResponsibilityViewSet, basename="responsibility")
api_router.register("branches", BranchViewSet, basename="branch")
api_router.register("departments", DepartmentViewSet, basename="department")
api_router.register("cities", CityViewSet, basename="city")
api_router.register("areas", AreaViewSet, basename="area")
api_router.register("locations", LocationViewSet, basename="location")

def redirect_frontend_home(request,leftover=None):
    """/admin apunta a la HomePage pública del frontend. no al admin de Django."""
    parsed = urlparse(settings.FRONTEND_BASE_URL)
    request_host = request.get_host().split(":")[0]
    frontend_host = (parsed.hostname or "").lower()
    if request_host.lower() in _LOOPBACK and frontend_host in _LOOPBACK:
        netloc = f"{request_host}:{parsed.port}" if parsed.port else request_host
        return redirect(urlunparse((parsed.scheme or "http",netloc, "/","","","")))
    return redirect(settings.FRONTEND_BASE_URL.rstrip("/")+"/")

    

urlpatterns = [
    re_path(r"^admin(/.*)?$",redirect_frontend_home),
    path('django-admin/', admin.site.urls),
    # API v1 (las rutas de cada app se irán incluyendo a medida que se creen)
    # OpenAPI / Swagger
    path("api/schema/",SpectacularAPIView.as_view(),name="schema"),
    path("api/docs/",SpectacularSwaggerView.as_view(url_name="schema"),name="swagger-ui"),
    path("api/redoc/",SpectacularRedocView.as_view(url_name="schema"),name="redoc"),
    path("api/v1/health/",HealthView.as_view(),name="health"),
    path("api/v1/", include(api_router.urls)),
    path("api/v1/auth/register/", PublicRegistrationView.as_view(), name="public-registration"),
    # JWT auth "clásico": tokens en el body. Para clientes sin cookies del
    # navegador (app móvil, Postman, scripts).
    path("api/v1/auth/token/",ThrottleTokenObtainPairView.as_view(),name="token-obtain"),
    path("api/v1/auth/token/refresh/",TokenRefreshView.as_view(),name="token-refresh"),
    path("api/v1/auth/token/verify/",TokenVerifyView.as_view(),name="token-verify"),
    path("api/v1/auth/token/blacklist/",TokenBlacklistView.as_view(),name="token-blacklist"),
    # JWT vía cookies httpOnly + CSRF. Solo para el frontend web — ver
    path("api/v1/auth/token/cookie/",CookieTokenObtainPairView.as_view(),name="token-obtain-cookie"),
    path("api/v1/auth/token/cookie/refresh/",CookieTokenRefreshView.as_view(),name="token-refresh-cookie"),
    path("api/v1/auth/token/cookie/logout/",CookieTokenLogoutView.as_view(),name="token-logout-cookie"),
    # MFA (TOTP por QR). verify = 2º paso del login; el resto es gestión.
    path("api/v1/auth/mfa/verify/", MFAVerifyView.as_view(), name="mfa-verify"),
    path("api/v1/auth/mfa/verify/cookie/", MFACookieVerifyView.as_view(), name="mfa-verify-cookie"),
    path("api/v1/auth/mfa/status/", MFAStatusView.as_view(), name="mfa-status"),
    path("api/v1/auth/mfa/setup/", MFASetupView.as_view(), name="mfa-setup"),
    path("api/v1/auth/mfa/confirm/", MFAConfirmView.as_view(), name="mfa-confirm"),
    path("api/v1/auth/mfa/recovery-codes/", MFARecoveryCodesView.as_view(), name="mfa-recovery-codes"),
    path("api/v1/auth/mfa/disable/", MFADisableView.as_view(), name="mfa-disable"),
    # Domain routes
]

if settings.DEBUG:
    # Servir archivos subidos por FileSystemStorage durante el desarrollo.
    # En prod se usa  un reverse-proxy que sirve /media directamente.
    urlpatterns += static(settings.MEDIA_URL,document_root=settings.MEDIA_ROOT)
    if "debug_toolbar" in settings.INSTALLED_APPS:
        urlpatterns += [path("__debug__/",include("debug_toolbar.urls"))]
